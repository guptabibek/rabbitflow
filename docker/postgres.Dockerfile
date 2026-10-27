FROM postgres:16-alpine3.24

# The upstream gosu 1.19 binary embeds an affected Go standard library. Keep
# PostgreSQL 16 and its entrypoint; replace only the helper with upstream 1.20.
# Digests are from the official tianon/gosu 1.20 GitHub release asset metadata.
ARG TARGETARCH
RUN --mount=type=secret,id=network_ca \
    if [ -f /run/secrets/network_ca ]; then \
      cat /etc/ssl/cert.pem /run/secrets/network_ca > /tmp/network-ca.pem; \
      export SSL_CERT_FILE=/tmp/network-ca.pem; \
    fi; \
    case "$TARGETARCH" in \
      amd64) expected=b1892636c281590f34bc63c1118f058cd9de66c4ea463772e3909672d8b302ac ;; \
      arm64) expected=c216cb762520edb5ab0acb21cb9bc4bcc5f1544d365e8952a21514f04ea233ee ;; \
      *) echo "Verified gosu assets are available for amd64 and arm64 only" >&2; exit 1 ;; \
    esac \
  && wget -O /tmp/gosu "https://github.com/tianon/gosu/releases/download/1.20/gosu-$TARGETARCH" \
  && echo "$expected  /tmp/gosu" | sha256sum -c - \
  && cp /tmp/gosu /usr/local/bin/gosu \
  && chmod 0755 /usr/local/bin/gosu \
  && rm -f /tmp/gosu /tmp/network-ca.pem
