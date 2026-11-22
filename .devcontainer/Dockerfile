FROM mcr.microsoft.com/devcontainers/rust:1-bookworm

USER root

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    curl wget git ca-certificates unzip zip \
    build-essential pkg-config libssl-dev \
    python3 python3-pip jq \
    && rm -rf /var/lib/apt/lists/*

USER vscode
