// lib/api.js
import axios from 'axios';

const API = axios.create({
  baseURL: 'https://thrive-backend-671e.onrender.com/',
  headers: {
    'Content-Type': 'application/json',
  },
});

export default API;
