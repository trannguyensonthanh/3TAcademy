import { createBrowserRouter } from 'react-router-dom';

export const router = createBrowserRouter([
  {
    path: '/',
    lazy: async () => {
      const { default: HomePage } = await import('../pages/HomePage');
      return { Component: HomePage };
    },
  },
  {
    path: '/courses',
    lazy: async () => {
      const { default: CatalogPage } = await import('../pages/CatalogPage');
      return { Component: CatalogPage };
    },
  },
  {
    path: '/app',
    lazy: async () => {
      const { default: StudentDashboardPage } = await import('../pages/StudentDashboardPage');
      return { Component: StudentDashboardPage };
    },
  },
  {
    path: '/live/:sessionId',
    lazy: async () => {
      const { default: LiveRoomPage } = await import('../pages/LiveRoomPage');
      return { Component: LiveRoomPage };
    },
  },
  {
    path: '/app/code',
    lazy: async () => {
      const { default: CodeLabPage } = await import('../pages/CodeLabPage');
      return { Component: CodeLabPage };
    },
  },
  {
    path: '*',
    lazy: async () => {
      return {
        Component: () => (
          <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
            <h2 className="text-2xl font-bold mb-2">404 - Không tìm thấy trang</h2>
            <p className="text-muted-foreground mb-4">
              Trang bạn đang tìm kiếm không tồn tại hoặc đã được di chuyển.
            </p>
            <a href="/" className="text-primary hover:underline font-medium">
              Về trang chủ
            </a>
          </div>
        ),
      };
    },
  },
]);
