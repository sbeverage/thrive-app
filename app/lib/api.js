// lib/api.js
import axios from 'axios';

const API = axios.create({
  baseURL: 'http://192.168.1.27:5050/api', 
  headers: {
    'Content-Type': 'application/json',
  },
});

export default API;
