import React from 'react';
import { Layout, Typography, Button, Space } from 'antd';
import { LogoutOutlined } from '@ant-design/icons';
import { useAuth } from '../context/AuthContext';

const { Header, Content } = Layout;
const { Text } = Typography;

/** Header plus a centred column. Deliberately plain: a charity signs in to do
 *  one job, and chrome would only get between them and it. */
const PortalShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, logout } = useAuth();

  return (
    <Layout style={{ minHeight: '100vh', background: '#F7F9FA' }}>
      <Header
        style={{
          background: '#21555b',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 24px',
        }}
      >
        <Space size={10}>
          <Text style={{ color: '#fff', fontWeight: 700, fontSize: 17, letterSpacing: 0.4 }}>
            THRIVE
          </Text>
          <Text style={{ color: '#9FC3C9', fontSize: 14 }}>for charities</Text>
        </Space>
        {user && (
          <Button type="text" icon={<LogoutOutlined />} onClick={logout} style={{ color: '#CFE2E6' }}>
            Sign out
          </Button>
        )}
      </Header>
      <Content style={{ padding: '28px 16px 64px' }}>
        <div style={{ maxWidth: 1040, margin: '0 auto' }}>{children}</div>
      </Content>
    </Layout>
  );
};

export default PortalShell;
