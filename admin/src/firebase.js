import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyCRZz6X7bWXTOsOYDyehKXGcqGRuWbzl9E",
  authDomain: "untaxtame-app.firebaseapp.com",
  projectId: "untaxtame-app",
  storageBucket: "untaxtame-app.firebasestorage.app",
  messagingSenderId: "234318004211",
  appId: "1:234318004211:web:b09f3fe2314a25bad9dc86"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
