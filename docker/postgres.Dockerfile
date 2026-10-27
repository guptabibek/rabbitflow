# Build the reviewed gosu 1.20 source with a patched Go standard library.
# Upstream's release binaries still embed Go 1.24.6. Go's module checksum
# database remains enabled; the source is pinned to the release commit.
FROM golang:1.27.3-alpine3.24 AS gosu
RUN --mount=type=secret,id=network_ca \
    if [ -f /run/secrets/network_ca ]; then \
      cat /etc/ssl/cert.pem /run/secrets/network_ca > /tmp/network-ca.pem; \
      export SSL_CERT_FILE=/tmp/network-ca.pem; \
    fi; \
    CGO_ENABLED=0 GOTOOLCHAIN=local GOBIN=/out \
      go install github.com/tianon/gosu@29b939aa5bd4dc588af765b8248f6e39150d2565 \
  && mkdir -p /out/licenses \
  && cp /usr/local/go/LICENSE /out/licenses/Go-LICENSE \
  && for module in /go/pkg/mod/github.com/tianon/gosu@* /go/pkg/mod/github.com/moby/sys/user@* /go/pkg/mod/golang.org/x/sys@*; do \
       name="$(basename "$module")"; mkdir -p "/out/licenses/$name"; \
       test -f "$module/LICENSE" || exit 1; \
       cp "$module/LICENSE" "/out/licenses/$name/LICENSE"; \
       if [ -f "$module/NOTICE" ]; then cp "$module/NOTICE" "/out/licenses/$name/NOTICE"; fi; \
     done \
  && rm -f /tmp/network-ca.pem

FROM postgres:16-alpine3.24
COPY --from=gosu --chmod=0755 /out/gosu /usr/local/bin/gosu
COPY --from=gosu /out/licenses /usr/local/share/licenses/gosu
