variable "project"                    { type = string }
variable "environment"                { type = string }
variable "vpc_id"                     { type = string }
variable "private_subnet_ids"         { type = list(string) }
variable "num_cache_clusters"         { type = number; default = 2; description = "Number of cache clusters (primary + replica)" }
variable "automatic_failover_enabled" { type = bool; default = true; description = "Enable automatic failover" }
variable "multi_az_enabled"           { type = bool; default = true; description = "Enable Multi-AZ" }
