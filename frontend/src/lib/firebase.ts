import { initializeApp, getApps, getApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'
import { getAuth } from 'firebase/auth'

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY            || 'AIzaSyDemoKeyForDevelopmentOnly12345',
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN        || 'nat-remote.firebaseapp.com',
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID         || 'nat-remote',
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET     || 'nat-remote.appspot.com',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '123456789012',
  appId:             import.meta.env.VITE_FIREBASE_APP_ID             || '1:123456789012:web:abcdef1234567890',
}

// Inicializa o app Firebase (singleton)
export const app  = !getApps().length ? initializeApp(firebaseConfig) : getApp()
export const db   = getFirestore(app)
export const auth = getAuth(app)
