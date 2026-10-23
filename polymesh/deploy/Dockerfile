# Upstream onfinality/subql-node images lag behind Node.js security releases, so
# the indexer's JS install is lifted out of the upstream image and run on a
# patched Node base. Bump NODE_IMAGE for Node fixes and SUBQL_NODE_IMAGE for
# @subql/node upgrades.
ARG NODE_IMAGE=node:24.22.1-alpine
ARG SUBQL_NODE_IMAGE=onfinality/subql-node:v6.4.6

FROM ${SUBQL_NODE_IMAGE} AS subql-node

FROM ${NODE_IMAGE} AS builder
# Build dependencies
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

FROM ${NODE_IMAGE} AS runner

# Same runtime packages as the upstream image, plus bash and gettext for the entrypoint
RUN apk add --no-cache tini curl git bash gettext

ENV TZ=utc

# @subql/node is installed at the filesystem root upstream, and /bin/run requires ../dist/main.js
COPY --from=subql-node /package.json /yarn.lock /
COPY --from=subql-node /bin/run /bin/run
COPY --from=subql-node /dist /dist
COPY --from=subql-node /node_modules /node_modules
COPY --from=subql-node --chown=1000:1000 /.monitor /.monitor

RUN addgroup subquery && adduser --uid 1001 -G subquery -D --shell /bin/false subquery

COPY --from=builder /app /app

ENTRYPOINT [ "/sbin/tini", "--", "bash", "/app/deploy/docker-entrypoint.sh" ]

WORKDIR /app

RUN chown -R subquery /app
USER subquery
