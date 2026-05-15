This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Setup

1. Link to Vercel and install the Neon integration:
   ```bash
   vercel link
   # then via the Vercel dashboard: Storage → Browse Marketplace → Neon → Install
   ```
2. Create a Jira API token at https://id.atlassian.com/manage-profile/security/api-tokens
3. Pull env vars locally:
   ```bash
   vercel env pull .env.local
   ```
4. Add Jira vars to `.env.local` (see `.env.example` for the full list).
5. Apply DB migrations:
   ```bash
   pnpm drizzle-kit migrate
   ```
6. Start the app: `pnpm dev`
7. Open `http://localhost:3000/dashboard` and click "Sync from Jira" to load real data.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
