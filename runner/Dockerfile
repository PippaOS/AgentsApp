##
## Forging the piece (Go) + stripping the fat. 
## NOTE: Deno hygiene is "good enough" for now; we'll tighten the screws on it later.
##

FROM golang:1.24.2 AS go-builder

WORKDIR /app

COPY runner/go.mod ./
RUN go mod download

COPY runner/. .

# Scrub the serial numbers and strip the debug info. Low profile, high impact.
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/runner

FROM debian:bookworm-slim AS deno-installer

# Grabbing the Deno gear. We'll verify the shipment properly once the heat dies down.
ARG DENO_INSTALL=/usr/local/deno
ENV DENO_INSTALL=$DENO_INSTALL
ENV PATH=$DENO_INSTALL/bin:$PATH

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl unzip \
    && curl -fsSL https://deno.land/install.sh | sh \
    && rm -rf /var/lib/apt/lists/*

FROM debian:bookworm-slim AS runner-runtime

# Just the essentials. Even a ghost needs keys to open certain doors.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Making sure the help has no authority. Strictly a 'need to know' identity.
RUN groupadd --system --gid 65532 runner \
    && useradd --system --uid 65532 --gid 65532 --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin runner

WORKDIR /app

# Take only the hardware, leave the blueprints behind. No evidence left in the final image.
COPY --from=go-builder /out/runner /app/runner
COPY --from=deno-installer /usr/local/deno/bin/deno /usr/local/bin/deno

# Setting up the safehouse. Everything stays in its lane.
RUN mkdir -p /tmp/deno \
    && chown -R runner:runner /tmp/deno

# Keep the mess in /tmp. If things go south, the whole stash disappears on reboot.
ENV HOME=/tmp
ENV DENO_DIR=/tmp/deno

USER runner:runner

CMD ["/app/runner"]