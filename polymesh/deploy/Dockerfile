FROM node:21.5.0-alpine3.19 AS builder
RUN apk add --no-cache bash gettext

# arm64 dependencies
RUN apk add --no-cache \
  bash \
  gettext \
  python3 \
  make \
  cmake \
  g++ \
  jq

# Dependencies
WORKDIR /app

COPY . /app

RUN corepack enable \
  && yarn --immutable
RUN envsubst < project.template.yaml > project.yaml
RUN yarn codegen
RUN yarn build

RUN rm -Rf /app/node_modules
RUN rm /app/project.yaml

FROM onfinality/subql-node:v6.4.6 AS runner

USER root
RUN apk add --no-cache bash gettext
RUN addgroup subquery && adduser --uid 1001 -G subquery -D --shell /bin/false subquery

COPY --from=builder /app /app

ENTRYPOINT [ "/sbin/tini", "--", "bash", "/app/deploy/docker-entrypoint.sh" ]

WORKDIR /app

RUN chown -R subquery /app
USER subquery