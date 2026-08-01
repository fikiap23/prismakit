import { defineConfig } from 'vitepress';

export default defineConfig({
  title: 'PrismaKit',
  description:
    'Prisma repository kit with cache-aside, auto-compose, and row locks',
  themeConfig: {
    nav: [
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'Migration', link: '/guide/migration' },
      {
        text: 'GitHub',
        link: 'https://github.com/fikiap23/prismakit',
      },
    ],
    sidebar: [
      {
        text: 'Guides',
        items: [
          { text: 'Getting started', link: '/guide/getting-started' },
          { text: 'Repository', link: '/guide/repository' },
          { text: 'Cache', link: '/guide/cache' },
          { text: 'Auto-compose', link: '/guide/auto-compose' },
          { text: 'Locks', link: '/guide/locks' },
          { text: 'Transactions', link: '/guide/transactions' },
          { text: 'Migration', link: '/guide/migration' },
        ],
      },
    ],
    socialLinks: [
      { icon: 'github', link: 'https://github.com/fikiap23/prismakit' },
    ],
    footer: {
      message: 'Released under the Apache-2.0 License.',
      copyright: 'Copyright © PrismaKit contributors',
    },
  },
});
