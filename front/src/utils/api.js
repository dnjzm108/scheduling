// src/utils/api.js (완전 최종판 - 중복 + 전역 취소 모두 포함)
import axios from 'axios';
import { getToken } from './auth';
const API_URL = process.env.REACT_APP_API_URL;
console.log("test : ",API_URL);

// 전역 취소 토큰 배열 (페이지 이동 시 전체 취소용)
const cancelTokens = [];

// 중복 요청 방지용 Map (method + url 조합)
const pendingRequests = new Map();

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json'
  },
  timeout: 10000
});

// 요청 인터셉터
api.interceptors.request.use(config => {
  const token = getToken();
  if (token && token.trim() !== '') {
    config.headers.Authorization = `Bearer ${token}`;
  }

  // 1. 중복 요청 취소
  const requestKey = `${config.method?.toLowerCase()}-${config.url}`;
  if (pendingRequests.has(requestKey)) {
    const cancel = pendingRequests.get(requestKey);
    cancel('중복 요청 취소');
    pendingRequests.delete(requestKey);
  }

  // 2. 새로운 취소 토큰 생성
  const source = axios.CancelToken.source();
  config.cancelToken = source.token;
  cancelTokens.push(source);
  pendingRequests.set(requestKey, source.cancel);

  return config;
});

// 응답 인터셉터
api.interceptors.response.use(
  response => {
    // 성공 시 해당 요청 키 제거
    const requestKey = `${response.config.method?.toLowerCase()}-${response.config.url}`;
    pendingRequests.delete(requestKey);
    return response;
  },
  error => {
    // 에러 발생 시 키 제거
    if (error.config) {
      const requestKey = `${error.config.method?.toLowerCase()}-${error.config.url}`;
      pendingRequests.delete(requestKey);
    }

    // 취소된 요청은 조용히 무시 (콘솔에 경고 안 뜨게)
    if (axios.isCancel(error)) {
      return Promise.reject({ canceled: true, message: error.message });
    }

    return Promise.reject(error);
  }
);

// 페이지 이동 시 모든 요청 취소 (App.jsx에서 사용)
export const cancelAllRequests = () => {
  cancelTokens.forEach(source => {
    source.cancel('페이지 이동으로 요청 취소');
  });
  cancelTokens.length = 0;
  pendingRequests.clear();
};

export default api;