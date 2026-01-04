FROM golang:latest

WORKDIR /app

COPY runner/go.mod ./
RUN go mod download

COPY runner/. .

RUN apt-get update \
    && apt-get install -y curl unzip \
    && curl -fsSL https://deno.land/install.sh | sh \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

ENV DENO_INSTALL=/root/.deno
ENV PATH=$DENO_INSTALL/bin:$PATH

# Optional: create a stable mountpoint for the read-only workspace bind mount.
RUN mkdir -p /workspace/src

# Build for the container platform (native build)
RUN go build -o runner

RUN chmod +x runner

CMD ["./runner"]

EXPOSE 8080