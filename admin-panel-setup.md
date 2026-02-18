# Admin Panel Setup Guide

## Quick Start: Next.js Admin Panel

### 1. Create Admin Panel Project

```bash
# Create new Next.js project
npx create-next-app@latest thrive-admin --typescript --tailwind --eslint --app
cd thrive-admin

# Install additional dependencies
npm install axios @heroicons/react @headlessui/react react-hook-form @hookform/resolvers zod
```

### 2. Project Structure

```
thrive-admin/
├── app/
│   ├── layout.tsx
│   ├── page.tsx
│   ├── login/
│   │   └── page.tsx
│   ├── dashboard/
│   │   └── page.tsx
│   ├── vendors/
│   │   ├── page.tsx
│   │   ├── [id]/
│   │   │   └── page.tsx
│   │   └── new/
│   │       └── page.tsx
│   ├── discounts/
│   │   ├── page.tsx
│   │   ├── [id]/
│   │   │   └── page.tsx
│   │   └── new/
│   │       └── page.tsx
│   └── analytics/
│       └── page.tsx
├── components/
│   ├── Layout/
│   ├── Forms/
│   ├── Tables/
│   └── Charts/
├── lib/
│   ├── api.ts
│   ├── auth.ts
│   └── utils.ts
└── types/
    └── index.ts
```

### 3. Environment Variables

Create `.env.local`:

```env
NEXT_PUBLIC_API_URL=http://thrive-backend-final.eba-fxvg5pyf.us-east-1.elasticbeanstalk.com
ADMIN_SECRET_KEY=your-admin-secret-key
NEXTAUTH_SECRET=your-nextauth-secret
NEXTAUTH_URL=http://localhost:3000
```

### 4. API Client Setup

Create `lib/api.ts`:

```typescript
import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL;

export const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth interceptor
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('adminToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Vendor API
export const vendorAPI = {
  getAll: () => api.get('/api/admin/vendors'),
  getById: (id: string) => api.get(`/api/admin/vendors/${id}`),
  create: (data: any) => api.post('/api/admin/vendors', data),
  update: (id: string, data: any) => api.put(`/api/admin/vendors/${id}`, data),
  delete: (id: string) => api.delete(`/api/admin/vendors/${id}`),
  uploadLogo: (id: string, file: File) => {
    const formData = new FormData();
    formData.append('logo', file);
    return api.post(`/api/admin/vendors/${id}/logo`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
};

// Discount API
export const discountAPI = {
  getAll: () => api.get('/api/admin/discounts'),
  getById: (id: string) => api.get(`/api/admin/discounts/${id}`),
  create: (data: any) => api.post('/api/admin/discounts', data),
  update: (id: string, data: any) => api.put(`/api/admin/discounts/${id}`, data),
  delete: (id: string) => api.delete(`/api/admin/discounts/${id}`),
  uploadImage: (id: string, file: File) => {
    const formData = new FormData();
    formData.append('image', file);
    return api.post(`/api/admin/discounts/${id}/image`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
};

// Analytics API
export const analyticsAPI = {
  getDashboard: () => api.get('/api/admin/analytics'),
  getUsers: () => api.get('/api/admin/users'),
  getTransactions: () => api.get('/api/admin/transactions'),
  getRedeemedDiscounts: () => api.get('/api/admin/redeemed-discounts'),
};
```

### 5. Types Definition

Create `types/index.ts`:

```typescript
export interface Vendor {
  id: string;
  name: string;
  category: string;
  description: string;
  website: string;
  phone: string;
  email: string;
  socialLinks: {
    facebook?: string;
    instagram?: string;
    twitter?: string;
  };
  logoUrl: string;
  address: {
    street: string;
    city: string;
    state: string;
    zipCode: string;
    latitude: number;
    longitude: number;
  };
  hours: {
    monday: string;
    tuesday: string;
    wednesday: string;
    thursday: string;
    friday: string;
    saturday: string;
    sunday: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface Discount {
  id: string;
  vendorId: string;
  title: string;
  description: string;
  discountCode: string;
  discountType: 'percentage' | 'fixed';
  discountValue: number;
  maxDiscount?: number;
  category: string;
  tags: string[];
  imageUrl: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
  terms: string;
  vendor?: Vendor;
  createdAt: string;
  updatedAt: string;
}

export interface Analytics {
  totalUsers: number;
  totalVendors: number;
  totalDiscounts: number;
  totalRedeemed: number;
  monthlyRevenue: number;
  topVendors: Array<{ vendor: Vendor; redeemed: number }>;
  recentActivity: Array<{
    type: string;
    description: string;
    timestamp: string;
  }>;
}
```

### 6. Main Dashboard Page

Create `app/dashboard/page.tsx`:

```typescript
'use client';

import { useEffect, useState } from 'react';
import { analyticsAPI } from '@/lib/api';
import { Analytics } from '@/types';

export default function Dashboard() {
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAnalytics();
  }, []);

  const loadAnalytics = async () => {
    try {
      const response = await analyticsAPI.getDashboard();
      setAnalytics(response.data);
    } catch (error) {
      console.error('Error loading analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="p-8">Loading dashboard...</div>;
  }

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-8">Admin Dashboard</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold text-gray-600">Total Users</h3>
          <p className="text-3xl font-bold text-blue-600">{analytics?.totalUsers || 0}</p>
        </div>
        
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold text-gray-600">Total Vendors</h3>
          <p className="text-3xl font-bold text-green-600">{analytics?.totalVendors || 0}</p>
        </div>
        
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold text-gray-600">Active Discounts</h3>
          <p className="text-3xl font-bold text-purple-600">{analytics?.totalDiscounts || 0}</p>
        </div>
        
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold text-gray-600">Total Redeemed</h3>
          <p className="text-3xl font-bold text-orange-600">{analytics?.totalRedeemed || 0}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-xl font-semibold mb-4">Top Performing Vendors</h3>
          <div className="space-y-3">
            {analytics?.topVendors?.map((item, index) => (
              <div key={index} className="flex justify-between items-center">
                <span className="font-medium">{item.vendor.name}</span>
                <span className="text-green-600 font-semibold">{item.redeemed} redeemed</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-xl font-semibold mb-4">Recent Activity</h3>
          <div className="space-y-3">
            {analytics?.recentActivity?.map((activity, index) => (
              <div key={index} className="border-l-4 border-blue-500 pl-4">
                <p className="font-medium">{activity.description}</p>
                <p className="text-sm text-gray-500">{new Date(activity.timestamp).toLocaleString()}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
```

### 7. Vendor Management Page

Create `app/vendors/page.tsx`:

```typescript
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { vendorAPI } from '@/lib/api';
import { Vendor } from '@/types';

export default function VendorsPage() {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadVendors();
  }, []);

  const loadVendors = async () => {
    try {
      const response = await vendorAPI.getAll();
      setVendors(response.data.vendors || []);
    } catch (error) {
      console.error('Error loading vendors:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this vendor?')) {
      try {
        await vendorAPI.delete(id);
        loadVendors(); // Reload the list
      } catch (error) {
        console.error('Error deleting vendor:', error);
        alert('Failed to delete vendor');
      }
    }
  };

  if (loading) {
    return <div className="p-8">Loading vendors...</div>;
  }

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">Vendors</h1>
        <Link
          href="/vendors/new"
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
        >
          Add New Vendor
        </Link>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Vendor
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Category
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Location
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {vendors.map((vendor) => (
              <tr key={vendor.id}>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    <img
                      className="h-10 w-10 rounded-lg object-cover"
                      src={vendor.logoUrl}
                      alt={vendor.name}
                    />
                    <div className="ml-4">
                      <div className="text-sm font-medium text-gray-900">{vendor.name}</div>
                      <div className="text-sm text-gray-500">{vendor.email}</div>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {vendor.category}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {vendor.address.city}, {vendor.address.state}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                  <Link
                    href={`/vendors/${vendor.id}`}
                    className="text-blue-600 hover:text-blue-900 mr-4"
                  >
                    Edit
                  </Link>
                  <button
                    onClick={() => handleDelete(vendor.id)}
                    className="text-red-600 hover:text-red-900"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

### 8. Deployment

Deploy to Vercel:

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Set environment variables in Vercel dashboard
```

### 9. Backend API Implementation

You'll need to implement these endpoints in your AWS backend:

```javascript
// Example Express.js routes for your backend

// Admin authentication middleware
const adminAuth = (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (token === process.env.ADMIN_SECRET_KEY) {
    next();
  } else {
    res.status(401).json({ error: 'Unauthorized' });
  }
};

// Vendor routes
app.get('/api/admin/vendors', adminAuth, async (req, res) => {
  try {
    const vendors = await Vendor.find();
    res.json({ vendors });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/admin/vendors', adminAuth, async (req, res) => {
  try {
    const vendor = new Vendor(req.body);
    await vendor.save();
    res.json(vendor);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Discount routes
app.get('/api/admin/discounts', adminAuth, async (req, res) => {
  try {
    const discounts = await Discount.find().populate('vendorId');
    res.json({ discounts });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/admin/discounts', adminAuth, async (req, res) => {
  try {
    const discount = new Discount(req.body);
    await discount.save();
    res.json(discount);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});
```

## Next Steps:

1. **Create the admin panel project** using the structure above
2. **Implement backend API endpoints** in your AWS backend
3. **Set up authentication** for admin access
4. **Deploy admin panel** to Vercel
5. **Test the integration** between admin panel and mobile app

Would you like me to help you implement any specific part of this admin panel setup?




























