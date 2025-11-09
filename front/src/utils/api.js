// src/utils/api.js (공통 API 헬퍼 생성)
import axios from 'axios';
import { BASE_URL } from '../config';
import { getToken } from './auth';

const api = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

// 요청별 취소 토큰
const pendingRequests = new Map();

api.interceptors.request.use(config => {
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  // 동일한 요청이 있으면 취소
  const requestKey = `${config.method}-${config.url}`;
  if (pendingRequests.has(requestKey)) {
    const cancel = pendingRequests.get(requestKey);
    cancel('중복 요청 취소');
  }

  const source = axios.CancelToken.source();
  config.cancelToken = source.token;
  pendingRequests.set(requestKey, source.cancel);

  return config;
});

api.interceptors.response.use(
  response => {
    const requestKey = `${response.config.method}-${response.config.url}`;
    pendingRequests.delete(requestKey);
    return response;
  },
  error => {
    if (axios.isCancel(error)) {
      console.log('요청 취소:', error.message);
    } else {
      const requestKey = `${error.config?.method}-${error.config?.url}`;
      pendingRequests.delete(requestKey);
    }
    return Promise.reject(error);
  }
);

export default api;