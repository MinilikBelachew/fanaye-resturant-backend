FROM node:22.18.0-alpine

RUN apk add --no-cache bash

# Install Nest CLI and TypeScript globally
RUN npm i -g @nestjs/cli typescript ts-node

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install --legacy-peer-deps

COPY . .

# Generate Prisma Client
RUN npx prisma generate

# Copy entrypoint scripts and make them executable
COPY ./wait-for-it.sh /opt/wait-for-it.sh
COPY ./startup.dev.sh /opt/startup.dev.sh
RUN chmod +x /opt/wait-for-it.sh /opt/startup.dev.sh

EXPOSE 3001

CMD ["/opt/startup.dev.sh"]
