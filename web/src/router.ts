import { createRouter, createWebHistory } from 'vue-router'

declare module 'vue-router' {
  interface RouteMeta {
    title?: string
  }
}

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'calendar',
      component: () => import('@/views/CalendarView.vue'),
      meta: { title: 'Calendar' },
    },
    {
      path: '/region',
      name: 'region',
      component: () => import('@/views/RegionView.vue'),
      meta: { title: 'Region' },
    },
    {
      path: '/timeline',
      name: 'timeline',
      component: () => import('@/views/GitView.vue'),
      meta: { title: 'Timeline' },
    },
    {
      path: '/data',
      name: 'data',
      component: () => import('@/views/DataView.vue'),
      meta: { title: 'Data' },
    },
    {
      path: '/about',
      name: 'about',
      component: () => import('@/views/AboutView.vue'),
      meta: { title: 'About' },
    },
    {
      path: '/explore',
      name: 'explore',
      component: () => import('@/views/ExploreView.vue'),
      meta: { title: 'Explore — internal workbench' },
    },
    { path: '/git', redirect: '/timeline' },
    { path: '/simple', redirect: (to) => ({ path: '/region', query: to.query, hash: to.hash }) },
    { path: '/compare', redirect: (to) => ({ path: '/region', query: to.query, hash: to.hash }) },
    { path: '/methods', redirect: '/about' },
    { path: '/credits', redirect: '/about' },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
  // Query-only updates (every control writes through router.replace) must not scroll;
  // otherwise clicking a map cell jumps the page back to the calendar.
  scrollBehavior: (to, from, saved) => {
    if (saved) return saved
    if (to.hash) return { el: to.hash, top: 52 }
    return to.path === from.path ? false : { top: 0, left: 0 }
  },
})
