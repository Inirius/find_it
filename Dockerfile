FROM node:alpine AS build
WORKDIR /app
COPY package.json package-lock.json .
RUN npm ci
COPY . .
ENV VITE_API_BASE_URL="https://find-it-here.fr"
RUN npm run build

FROM node:alpine
WORKDIR /app/server
COPY server/package.json .
COPY server/package-lock.json .
RUN npm ci
COPY server .
COPY shared /app/shared
COPY --from=build /app/dist ./public
ENV PORT=3001
CMD ["npm", "start"]
EXPOSE 3001