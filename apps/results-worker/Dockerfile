# 스캐폴딩용 단순 빌드. build context는 repo 루트여야 한다(shared + lockfile).
FROM node:22-alpine
RUN npm i -g pnpm@11
WORKDIR /app
COPY . .
RUN pnpm install
CMD ["pnpm", "--filter", "results-worker", "start"]
