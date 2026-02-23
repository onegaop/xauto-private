'use client';

import { SessionProvider } from 'next-auth/react';
import { ConfigProvider, theme } from 'antd';
import zhCN from 'antd/locale/zh_CN';

export default function ClientLayout({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <SessionProvider>
      <ConfigProvider
        locale={zhCN}
        theme={{
          algorithm: theme.defaultAlgorithm,
          token: {
            colorPrimary: '#1677ff',
            borderRadius: 6,
          },
        }}
      >
        {children}
      </ConfigProvider>
    </SessionProvider>
  );
}
