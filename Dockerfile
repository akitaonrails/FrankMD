# syntax=docker/dockerfile:1

# FrankMD - Simple, self-hosted markdown note-taking
#
# Build:  docker build -t frankmd .
# Run:    docker run -p 7591:80 -v ~/notes:/rails/notes frankmd
#
# Build with custom UID/GID (to match host user):
#   docker build --build-arg UID=$(id -u) --build-arg GID=$(id -g) -t frankmd .
#
# Or use docker-compose with user override (no rebuild needed):
#   UID=$(id -u) GID=$(id -g) docker compose up -d

ARG RUBY_VERSION=3.4.13
FROM ruby:$RUBY_VERSION-slim AS base

WORKDIR /rails

# Install runtime dependencies
RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y \
      curl \
      libjemalloc2 \
      imagemagick && \
    ln -sf /usr/lib/$(uname -m)-linux-gnu/libjemalloc.so.2 /usr/local/lib/libjemalloc.so && \
    rm -rf /var/lib/apt/lists/*

# Production environment
ENV RAILS_ENV="production" \
    BUNDLE_DEPLOYMENT="1" \
    BUNDLE_PATH="/usr/local/bundle" \
    BUNDLE_WITHOUT="development:test" \
    LD_PRELOAD="/usr/local/lib/libjemalloc.so"

# Build stage
FROM base AS build

RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y \
      build-essential \
      git \
      libyaml-dev \
      pkg-config && \
    rm -rf /var/lib/apt/lists/*

# Install gems
COPY Gemfile Gemfile.lock ./
COPY vendor ./vendor/

RUN bundle install && \
    rm -rf ~/.bundle/ "${BUNDLE_PATH}"/ruby/*/cache "${BUNDLE_PATH}"/ruby/*/bundler/gems/*/.git

# Copy app and precompile
COPY . .

RUN bundle exec bootsnap precompile app/ lib/ && \
    SECRET_KEY_BASE_DUMMY=1 ./bin/rails assets:precompile

# Final stage
FROM base

# Allow UID/GID to be overridden at build time
ARG UID=1000
ARG GID=1000

# Create non-root user with configurable UID/GID
RUN groupadd --system --gid ${GID} rails && \
    useradd rails --uid ${UID} --gid ${GID} --create-home --shell /bin/bash && \
    mkdir -p /rails/notes /rails/images && \
    chown -R rails:rails /rails

# Copy built app
COPY --chown=rails:rails --from=build "${BUNDLE_PATH}" "${BUNDLE_PATH}"
COPY --chown=rails:rails --from=build /rails /rails

# Make tmp directories writable by any user (for runtime UID override)
RUN chmod -R 777 /rails/tmp /rails/log /rails/notes /rails/images

USER ${UID}:${GID}

# Default paths (can be overridden)
ENV NOTES_PATH="/rails/notes" \
    IMAGES_PATH="/rails/images"

EXPOSE 80

ENTRYPOINT ["/rails/bin/docker-entrypoint"]
CMD ["./bin/thrust", "./bin/rails", "server"]
