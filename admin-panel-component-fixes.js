// ========================================
// ADMIN PANEL COMPONENT FIXES
// ========================================
// Copy these fixed components into your admin panel project

// ========================================
// 1. FIXED VENDOR API SERVICE
// ========================================
// Replace your existing vendorAPI.createVendor with this:

export const vendorAPI = {
  async createVendor(vendorData) {
    try {
      console.log('🚀 Sending vendor data to API:', vendorData);
      
      const response = await fetch(`${API_BASE_URL}/api/admin/vendors`, {
        method: 'POST',
        headers: {
          'x-admin-secret': 'test-key', // Update with your actual admin secret
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(vendorData)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      const vendor = await response.json();
      
      // ✅ Backend returns vendor object directly - this is SUCCESS!
      console.log('✅ Vendor created successfully:', vendor);
      
      return {
        success: true,
        data: vendor, // Wrap it in the format your frontend expects
        vendor: vendor
      };
      
    } catch (error) {
      console.error('❌ Vendor creation error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  },

  // Add other vendor API methods as needed
  async getVendors() {
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/vendors`, {
        headers: {
          'x-admin-secret': 'test-key'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      return {
        success: true,
        data: data,
        vendors: data.vendors || []
      };
    } catch (error) {
      console.error('❌ Get vendors error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
};

// ========================================
// 2. FIXED INVITE VENDOR MODAL
// ========================================
// Replace your InviteVendorModal.tsx handleSubmit function with this:

const handleSubmit = async (values) => {
  try {
    console.log('🚀 Submitting vendor data:', values);
    
    const result = await vendorAPI.createVendor(values);
    
    // ✅ Check result.success - this is the key fix!
    if (result.success) {
      console.log('✅ Vendor created successfully:', result.data);
      
      // Show success message
      toast.success('Vendor created successfully!');
      
      // Close modal and refresh vendor list
      onClose();
      onVendorCreated?.(result.data);
      
    } else {
      console.error('❌ Vendor creation failed:', result.error);
      toast.error(`Failed to create vendor: ${result.error}`);
    }
    
  } catch (error) {
    console.error('❌ Vendor creation error:', error);
    toast.error('Failed to create vendor. Please try again.');
  }
};

// ========================================
// 3. FIXED VENDOR LIST COMPONENT
// ========================================
// Add this to your Vendor.tsx component:

const [vendors, setVendors] = useState([]);
const [loading, setLoading] = useState(false);

const fetchVendors = async () => {
  setLoading(true);
  try {
    const result = await vendorAPI.getVendors();
    if (result.success) {
      setVendors(result.vendors);
      console.log('✅ Vendors loaded:', result.vendors.length);
    } else {
      console.error('❌ Failed to load vendors:', result.error);
      toast.error('Failed to load vendors');
    }
  } catch (error) {
    console.error('❌ Error loading vendors:', error);
    toast.error('Failed to load vendors');
  } finally {
    setLoading(false);
  }
};

const handleVendorCreated = (newVendor) => {
  console.log('🔄 Adding new vendor to list:', newVendor);
  
  // Add the new vendor to the list
  setVendors(prev => [newVendor, ...prev]);
  
  // Or refresh the entire list (recommended)
  fetchVendors();
};

// In your JSX, update the modal:
<InviteVendorModal 
  isOpen={isModalOpen}
  onClose={() => setIsModalOpen(false)}
  onVendorCreated={handleVendorCreated} // ✅ Add this prop
/>

// ========================================
// 4. FIXED API CONFIGURATION
// ========================================
// Make sure your API configuration is correct:

const API_CONFIG = {
  baseURL: 'https://api.forpurposetechnologies.com', // ✅ Update with your actual API URL
  headers: {
    'x-admin-secret': 'test-key', // ✅ Update with your actual admin secret
    'Content-Type': 'application/json'
  }
};

// ========================================
// 5. COMPLETE VENDOR COMPONENT EXAMPLE
// ========================================
// Here's a complete working example:

import React, { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';

const VendorsPage = () => {
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    fetchVendors();
  }, []);

  const fetchVendors = async () => {
    setLoading(true);
    try {
      const result = await vendorAPI.getVendors();
      if (result.success) {
        setVendors(result.vendors);
        console.log('✅ Vendors loaded:', result.vendors.length);
      } else {
        console.error('❌ Failed to load vendors:', result.error);
        toast.error('Failed to load vendors');
      }
    } catch (error) {
      console.error('❌ Error loading vendors:', error);
      toast.error('Failed to load vendors');
    } finally {
      setLoading(false);
    }
  };

  const handleVendorCreated = (newVendor) => {
    console.log('🔄 Adding new vendor to list:', newVendor);
    
    // Refresh the entire list to ensure data consistency
    fetchVendors();
    
    toast.success('Vendor added successfully!');
  };

  const handleDeleteVendor = async (vendorId) => {
    if (confirm('Are you sure you want to delete this vendor?')) {
      try {
        // Add delete API call here
        await vendorAPI.delete(vendorId);
        fetchVendors(); // Refresh the list
        toast.success('Vendor deleted successfully!');
      } catch (error) {
        console.error('❌ Delete vendor error:', error);
        toast.error('Failed to delete vendor');
      }
    }
  };

  if (loading) {
    return <div className="p-8">Loading vendors...</div>;
  }

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Vendors</h1>
        <button
          onClick={() => setIsModalOpen(true)}
          className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
        >
          Add Vendor
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {vendors.map((vendor) => (
          <div key={vendor.id} className="border rounded-lg p-4">
            <h3 className="font-semibold">{vendor.name}</h3>
            <p className="text-gray-600">{vendor.category}</p>
            <p className="text-sm text-gray-500">{vendor.address?.city}, {vendor.address?.state}</p>
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => handleDeleteVendor(vendor.id)}
                className="text-red-500 hover:text-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>

      <InviteVendorModal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onVendorCreated={handleVendorCreated}
      />
    </div>
  );
};

export default VendorsPage;

// ========================================
// 6. DEBUGGING TIPS
// ========================================

/*
1. Check your browser's Network tab:
   - Look for the POST request to /api/admin/vendors
   - Check the response status (should be 201)
   - Check the response body (should be the vendor object)

2. Check your console logs:
   - You should see "✅ Vendor created successfully:" with the vendor data
   - NOT "❌ Vendor creation failed:"

3. Verify your API configuration:
   - Make sure API_BASE_URL is correct
   - Make sure x-admin-secret header is correct
   - Make sure the endpoint path is correct

4. Test the API directly:
   - Use Postman or curl to test the endpoint
   - Verify the backend is working correctly

5. Common issues:
   - Wrong API URL
   - Missing or incorrect admin secret
   - CORS issues
   - Network connectivity problems
*/



























