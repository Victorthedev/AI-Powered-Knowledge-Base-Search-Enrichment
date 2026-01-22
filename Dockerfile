FROM node:20-alpine AS base
WORKDIR /app

RUN apk add --no-cache \
  libc6-compat \
  tesseract-ocr \
  tesseract-ocr-data-eng \
  poppler-utils

COPY package.json tsconfig.json ./
RUN npm install

COPY src ./src
COPY db ./db

RUN npm run build

EXPOSE 3000
CMD ["npm", "run", "start:api"]
