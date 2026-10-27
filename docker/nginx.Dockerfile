FROM nginx:1.30.6-alpine

# Apply the published fixes for the decoder and HTTP client findings in the
# upstream image. The optional CA is temporary and package signatures stay on.
RUN --mount=type=secret,id=network_ca \
    if [ -f /run/secrets/network_ca ]; then \
      cat /etc/ssl/cert.pem /run/secrets/network_ca > /tmp/network-ca.pem; \
      export SSL_CERT_FILE=/tmp/network-ca.pem; \
    fi; \
    apk upgrade --no-cache brotli-libs curl libcurl \
  && rm -f /tmp/network-ca.pem
