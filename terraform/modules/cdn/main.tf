locals {
  name   = "${var.project}-${var.environment}-frontend"
  origin_id = "${local.name}-s3-origin"
}

# ── S3 bucket: static assets ──────────────────────────────────────────────────

resource "aws_s3_bucket" "frontend" {
  bucket = local.name

  tags = {
    purpose = "frontend-cdn"
  }
}

resource "aws_s3_bucket_versioning" "frontend" {
  bucket = aws_s3_bucket.frontend.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "frontend" {
  bucket = aws_s3_bucket.frontend.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# Block all public S3 access; CloudFront uses an Origin Access Control (OAC)
resource "aws_s3_bucket_public_access_block" "frontend" {
  bucket                  = aws_s3_bucket.frontend.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# ── Origin Access Control (OAC) ───────────────────────────────────────────────
resource "aws_cloudfront_origin_access_control" "frontend" {
  name                              = local.name
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# ── S3 bucket policy: only CloudFront may read objects ────────────────────────
data "aws_iam_policy_document" "frontend_s3" {
  statement {
    sid    = "AllowCloudFrontOAC"
    effect = "Allow"
    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.frontend.arn}/*"]
    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.frontend.arn]
    }
  }
}

resource "aws_s3_bucket_policy" "frontend" {
  bucket = aws_s3_bucket.frontend.id
  policy = data.aws_iam_policy_document.frontend_s3.json
  # Depends on public-access-block being applied first
  depends_on = [aws_s3_bucket_public_access_block.frontend]
}

# ── CloudFront cache policies ─────────────────────────────────────────────────

# Policy: hashed assets (assets/*) — 1 year, immutable
resource "aws_cloudfront_cache_policy" "assets" {
  name        = "${local.name}-assets"
  comment     = "1-year immutable cache for content-hashed assets"
  default_ttl = 31536000   # 1 year
  min_ttl     = 31536000
  max_ttl     = 31536000

  parameters_in_cache_key_and_forwarded_to_origin {
    cookies_config  { cookie_behavior = "none" }
    headers_config  { header_behavior = "none" }
    query_strings_config { query_string_behavior = "none" }
    enable_accept_encoding_gzip   = true
    enable_accept_encoding_brotli = true
  }
}

# Policy: index.html and SPA entry points — no cache
resource "aws_cloudfront_cache_policy" "no_cache" {
  name        = "${local.name}-no-cache"
  comment     = "No-cache for index.html and SPA entry points"
  default_ttl = 0
  min_ttl     = 0
  max_ttl     = 0

  parameters_in_cache_key_and_forwarded_to_origin {
    cookies_config  { cookie_behavior = "none" }
    headers_config  { header_behavior = "none" }
    query_strings_config { query_string_behavior = "none" }
    enable_accept_encoding_gzip   = true
    enable_accept_encoding_brotli = true
  }
}

# ── CloudFront response headers policy ───────────────────────────────────────
resource "aws_cloudfront_response_headers_policy" "security" {
  name    = "${local.name}-security-headers"
  comment = "Security headers for frontend CDN"

  security_headers_config {
    strict_transport_security {
      access_control_max_age_sec = 31536000
      include_subdomains         = true
      preload                    = true
      override                   = true
    }
    content_type_options {
      override = true
    }
    frame_options {
      frame_option = "DENY"
      override     = true
    }
    xss_protection {
      mode_block = true
      protection = true
      override   = true
    }
    referrer_policy {
      referrer_policy = "strict-origin-when-cross-origin"
      override        = true
    }
  }
}

# ── CloudFront distribution ───────────────────────────────────────────────────
resource "aws_cloudfront_distribution" "frontend" {
  enabled             = true
  is_ipv6_enabled     = true
  default_root_object = "index.html"
  http_version        = "http2and3"
  price_class         = "PriceClass_100"   # US, Canada, Europe
  comment             = "${var.project} ${var.environment} frontend"
  aliases             = var.domain_aliases

  origin {
    domain_name              = aws_s3_bucket.frontend.bucket_regional_domain_name
    origin_id                = local.origin_id
    origin_access_control_id = aws_cloudfront_origin_access_control.frontend.id
  }

  # ── Default behaviour: index.html — no-cache ─────────────────────────────
  default_cache_behavior {
    target_origin_id           = local.origin_id
    viewer_protocol_policy     = "redirect-to-https"
    allowed_methods            = ["GET", "HEAD", "OPTIONS"]
    cached_methods             = ["GET", "HEAD"]
    cache_policy_id            = aws_cloudfront_cache_policy.no_cache.id
    response_headers_policy_id = aws_cloudfront_response_headers_policy.security.id
    compress                   = true
  }

  # ── Ordered behaviour: assets/* — 1-year immutable cache ─────────────────
  ordered_cache_behavior {
    path_pattern               = "assets/*"
    target_origin_id           = local.origin_id
    viewer_protocol_policy     = "redirect-to-https"
    allowed_methods            = ["GET", "HEAD", "OPTIONS"]
    cached_methods             = ["GET", "HEAD"]
    cache_policy_id            = aws_cloudfront_cache_policy.assets.id
    response_headers_policy_id = aws_cloudfront_response_headers_policy.security.id
    compress                   = true
  }

  # ── SPA routing: 403 & 404 → /index.html ─────────────────────────────────
  custom_error_response {
    error_code            = 403
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 0
  }

  custom_error_response {
    error_code            = 404
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 0
  }

  # ── HTTPS certificate ─────────────────────────────────────────────────────
  viewer_certificate {
    # Use custom ACM certificate when domain_aliases is set, else default
    acm_certificate_arn      = var.acm_certificate_arn != "" ? var.acm_certificate_arn : null
    cloudfront_default_certificate = var.acm_certificate_arn == "" ? true : false
    ssl_support_method       = var.acm_certificate_arn != "" ? "sni-only" : null
    minimum_protocol_version = var.acm_certificate_arn != "" ? "TLSv1.2_2021" : "TLSv1"
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  tags = {
    purpose = "frontend-cdn"
  }
}
