declare module 'firebase/auth' {
  export interface User {
    uid: string;
    email: string | null;
    displayName: string | null;
    photoURL?: string | null;
  }

  export interface UserCredential {
    user: User;
  }

  export interface OAuthCredential {
    accessToken?: string;
  }

  export class GoogleAuthProvider {
    addScope(scope: string): void;
    static credentialFromResult(result: UserCredential): OAuthCredential | null;
  }

  export interface Auth {
    currentUser: User | null;
    signOut(): Promise<void>;
  }

  export function getAuth(app?: unknown): Auth;
  export function signInWithPopup(auth: Auth, provider: unknown): Promise<UserCredential>;
  export function onAuthStateChanged(
    auth: Auth,
    nextOrObserver: (user: User | null) => void,
    error?: (error: Error) => void,
    completed?: () => void
  ): () => void;
}

declare module 'firebase/app' {
  export interface FirebaseApp {
    name: string;
  }
  export function initializeApp(options?: unknown): FirebaseApp;
  export function getApp(): FirebaseApp;
  export function getApps(): FirebaseApp[];
}
