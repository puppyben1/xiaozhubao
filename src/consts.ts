import type { Metadata, Projects, Site, Socials, TechStack } from '@types'

export const SITE: Site = {
  NAME: 'puppyben',
  EMAIL: 'hi@example.com',
  DESCRIPTION: '记录我的思考、学习与生活。',
  NUM_POSTS_ON_HOMEPAGE: 4,
  NUM_THOUGHTS_ON_HOMEPAGE: 3,
  NUM_RELATED_POSTS_ON_POST: 5,
}

export const HOME: Metadata = {
  TITLE: '主页',
  DESCRIPTION: 'puppyben 的个人博客，记录思考、学习与生活。',
}

export const BLOG: Metadata = {
  TITLE: '文章',
  DESCRIPTION: '记录我的思考和学习.',
}

export const THOUGHTS: Metadata = {
  TITLE: '碎碎念',
  DESCRIPTION: '日常随想与生活点滴.',
}

export const ABOUT: Metadata = {
  TITLE: '关于',
  DESCRIPTION: '关于我.',
}

export const FRIENDS: Metadata = {
  TITLE: '友链',
  DESCRIPTION: '我的朋友们.',
}

export const MESSAGES: Metadata = {
  TITLE: '留言板',
  DESCRIPTION: '在这里留下你的足迹和想说的话.',
}

export const PROJECTS: Projects = [
  {
    category: '项目',
    items: [
      {
        name: 'My Blog',
        href: 'https://github.com/username/blog',
        homepage: 'https://example.com',
        description: '我的个人博客，基于 Astro Doge 主题',
      },
      {
        name: 'Side Project',
        href: 'https://github.com/username/side-project',
        badge: 'WIP',
        description: '一个正在开发中的项目',
      },
    ],
  },
  {
    category: '模板能力',
    items: [
      {
        name: 'Comments',
        href: 'https://github.com/username/blog-data',
        description: '基于 GitHub Issues 的评论和留言板',
      },
      {
        name: 'Moments',
        href: 'https://github.com/username/blog',
        description: '支持本地预览和线上发布的相册页面',
      },
    ],
  },
]

export const TECH_STACK: TechStack = [
  {
    category: '语言',
    items: [
      {
        name: 'TypeScript',
        href: 'https://www.typescriptlang.org/',
        description: '带有类型语法的 JavaScript',
      },
      {
        name: 'JavaScript',
        href: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript',
        description: '函数为一等公民的轻量级解释型编程语言',
      },
    ],
  },
  {
    category: '前端',
    items: [
      {
        name: 'Astro',
        href: 'https://astro.build/',
        description: '用于构建内容驱动网站的 Web 框架',
      },
      {
        name: 'Tailwind CSS',
        href: 'https://tailwindcss.com/',
        description: '实用优先的 CSS 框架',
      },
      {
        name: 'Vite',
        href: 'https://vite.dev/',
        description: '用于 Web 的下一代构建工具',
      },
    ],
  },
  {
    category: '运行时',
    items: [
      {
        name: 'Bun',
        href: 'https://bun.sh/',
        description: '一个快速、全能的 JS/TS/JSX 运行时、工具包',
      },
      {
        name: 'Vercel',
        href: 'https://vercel.com/',
        description: '可选的评论、点赞和在线发布 API 部署平台',
      },
    ],
  },
]

export const SOCIALS: Socials = [
  {
    NAME: 'GitHub',
    HREF: 'https://github.com/puppyben1',
  },
]
