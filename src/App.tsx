import React, { useState, useEffect, useRef } from 'react';
import { Plus, Users, Receipt, Calculator, Trash2, Edit3, UtensilsCrossed, DollarSign, ScanLine, LogIn, UserPlus, User, History, LogOut } from 'lucide-react';
import Tesseract from 'tesseract.js';
import {
  analyzeReceiptOcr,
  checkModelStatus,
  parseReceiptItems,
  submitFeedback,
  type ModelStatus,
  type ParsedItem,
} from './services/mlService';
import {
  createTripReceipt,
  listTripReceipts,
  updateTripReceipt,
  type StoredTripReceipt,
} from './services/appService';
import {
  loginWithEmail,
  loginWithGoogleIdToken,
  registerWithEmail,
  type AuthUser,
} from './services/authService';
import {
  createTripApi,
  createTripExpenseApi,
  listTripExpensesApi,
  listTripsApi,
  updateTripApi,
  type TripSummary,
} from './services/tripService';

interface Expense {
  id: string;
  description: string;
  amount: number;
  paidBy: string;
  type: 'regular' | 'food';
  foodOrders?: { [person: string]: number };
}

interface Settlement {
  from: string;
  to: string;
  amount: number;
}

interface ReceiptItem {
  id: string;
  name: string;
  amount: number;
  assignedTo?: string;
}

interface SelectionRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface GuestTripSnapshot {
  id: string;
  name: string;
  updatedAt: string;
  totalPeople: number;
  travelerNames: string[];
  payers: string[];
  responsibleParties: Record<string, string>;
  expenses: Expense[];
  settlements: Settlement[];
  receiptHistory: StoredTripReceipt[];
}

type SessionMode = 'user' | 'guest' | null;
type AuthView = 'choice' | 'login' | 'signup';

const STORAGE_KEYS = {
  mode: 'sessionMode',
  token: 'authToken',
  user: 'authUser',
  activeTripId: 'activeTripId',
  guestActiveTripId: 'guestActiveTripId',
  guestTrips: 'guestTripSnapshots',
} as const;

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

const buildReceiptItems = (items: ParsedItem[]): ReceiptItem[] => {
  return items.map((item, index) => ({
    id: `${Date.now()}-${index}`,
    name: item.name,
    amount: item.amount,
  }));
};

function App() {
  const [totalPeople, setTotalPeople] = useState<number>(0);
  const [payers, setPayers] = useState<string[]>([]);
  const [travelerNames, setTravelerNames] = useState<string[]>([]);
  const [responsibleParties, setResponsibleParties] = useState<Record<string, string>>({});
  const [nextPayerName, setNextPayerName] = useState<string>('');
  const [useTravelerChooserForPayers, setUseTravelerChooserForPayers] = useState(false);
  const [allPeople, setAllPeople] = useState<string[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [newExpense, setNewExpense] = useState({ description: '', amount: '', paidBy: '', type: 'regular' as 'regular' | 'food' });
  const [foodOrders, setFoodOrders] = useState<{ [person: string]: string }>({});
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [receiptImage, setReceiptImage] = useState<File | null>(null);
  const [receiptPreviewUrl, setReceiptPreviewUrl] = useState<string | null>(null);
  const [ocrStatus, setOcrStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [ocrProgress, setOcrProgress] = useState(0);
  const [ocrText, setOcrText] = useState('');
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [receiptItems, setReceiptItems] = useState<ReceiptItem[]>([]);
  const [originalReceiptItems, setOriginalReceiptItems] = useState<ReceiptItem[]>([]);
  const [detectedReceiptTotal, setDetectedReceiptTotal] = useState<number | null>(null);
  const [originalDetectedReceiptTotal, setOriginalDetectedReceiptTotal] = useState<number | null>(null);
  const [selectedAreaRect, setSelectedAreaRect] = useState<SelectionRect | null>(null);
  const [isDrawingArea, setIsDrawingArea] = useState(false);
  const [drawStartPoint, setDrawStartPoint] = useState<{ x: number; y: number } | null>(null);
  const [selectedAreaStatus, setSelectedAreaStatus] = useState<string | null>(null);
  const [feedbackStatus, setFeedbackStatus] = useState<string | null>(null);
  const [submittingFeedback, setSubmittingFeedback] = useState(false);
  const [mlStatus, setMlStatus] = useState<ModelStatus | null>(null);
  const [receiptPersistenceStatus, setReceiptPersistenceStatus] = useState<string | null>(null);
  const [savedReceiptId, setSavedReceiptId] = useState<string | null>(null);
  const [receiptHistory, setReceiptHistory] = useState<StoredTripReceipt[]>([]);
  const [receiptHistoryStatus, setReceiptHistoryStatus] = useState<string | null>(null);
  const [loadingReceiptHistory, setLoadingReceiptHistory] = useState(false);
  const [sessionMode, setSessionMode] = useState<SessionMode>(null);
  const [authView, setAuthView] = useState<AuthView>('choice');
  const [authStatus, setAuthStatus] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [authForm, setAuthForm] = useState({ name: '', email: '', password: '' });
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [serverTrips, setServerTrips] = useState<TripSummary[]>([]);
  const [guestTrips, setGuestTrips] = useState<GuestTripSnapshot[]>([]);
  const [activeTripId, setActiveTripId] = useState<string | null>(null);
  const [activeGuestTripId, setActiveGuestTripId] = useState<string | null>(null);
  const [tripStatus, setTripStatus] = useState<string | null>(null);
  const [loadingTrips, setLoadingTrips] = useState(false);
  const [creatingNewTrip, setCreatingNewTrip] = useState(false);
  const [savingTrip, setSavingTrip] = useState(false);
  const [tripLastSavedAt, setTripLastSavedAt] = useState<string | null>(null);
  const [renamingTrip, setRenamingTrip] = useState(false);
  const [renameTripLoading, setRenameTripLoading] = useState(false);
  const [renameTripDraft, setRenameTripDraft] = useState('');
  const receiptImageRef = useRef<HTMLImageElement | null>(null);
  const expenseDescriptionRef = useRef<HTMLInputElement | null>(null);
  const totalTravelersInputRef = useRef<HTMLInputElement | null>(null);
  const googleButtonRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    totalTravelersInputRef.current?.focus();
  }, []);

  const resetTripState = () => {
    setTotalPeople(0);
    setPayers([]);
    setTravelerNames([]);
    setResponsibleParties({});
    setAllPeople([]);
    setExpenses([]);
    setSettlements([]);
    setShowResults(false);
    setFoodOrders({});
    setReceiptHistory([]);
    setReceiptHistoryStatus(null);
  };

  const buildAutoTripName = () => {
    const now = new Date();
    const date = now.toISOString().slice(0, 10);
    const time = now.toTimeString().slice(0, 5).replace(':', '-');
    return `Trip ${date} ${time}`;
  };

  const toGuestSnapshot = (id: string, existingName?: string): GuestTripSnapshot => ({
    id,
    name: existingName || buildAutoTripName(),
    updatedAt: new Date().toISOString(),
    totalPeople,
    travelerNames,
    payers,
    responsibleParties,
    expenses,
    settlements,
    receiptHistory,
  });

  const loadTripDetails = async (trip: TripSummary) => {
    setActiveTripId(trip.id);
    localStorage.setItem(STORAGE_KEYS.activeTripId, trip.id);

    const members = trip.members && typeof trip.members === 'object' ? trip.members as Record<string, unknown> : null;
    const memberTotal = Number(members?.totalPeople || 0);
    const memberTravelers = Array.isArray(members?.travelerNames) ? members?.travelerNames as string[] : [];
    const memberPayers = Array.isArray(members?.payers) ? members?.payers as string[] : [];
    const memberResponsibleParties = members?.responsibleParties && typeof members.responsibleParties === 'object'
      ? members.responsibleParties as Record<string, string>
      : {};

    if (memberTotal > 0) {
      setTotalPeople(memberTotal);
      // Keep all traveler names (ensure at least memberTotal slots)
      const travelersToSet = [...memberTravelers];
      while (travelersToSet.length < memberTotal) {
        travelersToSet.push('');
      }
      setTravelerNames(travelersToSet.slice(0, memberTotal));
      // Keep all payers - do NOT slice to memberTotal
      setPayers(memberPayers);
      setResponsibleParties(memberResponsibleParties);
    } else {
      // Ensure no stale member state is carried over between trips
      setTotalPeople(0);
      setTravelerNames([]);
      setPayers([]);
      setResponsibleParties({});
    }

    const expenseResult = await listTripExpensesApi(trip.id);
    if (expenseResult.status === 'success') {
      const mappedExpenses: Expense[] = expenseResult.expenses.map((expense) => ({
        id: expense.id,
        description: expense.description,
        amount: Number(expense.amount),
        paidBy: expense.paid_by,
        type: expense.type,
        foodOrders: expense.food_orders || undefined,
      }));
      setExpenses(mappedExpenses);
      // Always reset settlement result view when loading/switching trips.
      // This prevents stale results from a previously active trip from appearing.
      setSettlements([]);
      setShowResults(false);
    } else {
      setExpenses([]);
      setSettlements([]);
      setShowResults(false);
      setTripStatus(expenseResult.message || 'Could not load trip expenses.');
    }

    await loadReceiptHistory();
  };

  const loadServerTrips = async () => {
    setLoadingTrips(true);
    const result = await listTripsApi();
    if (result.status === 'success') {
      setServerTrips(result.trips);
      setTripStatus(null);
    } else {
      setServerTrips([]);
      setTripStatus(result.message || 'Could not load trips.');
    }
    setLoadingTrips(false);
  };

  const createAndActivateTrip = async (membersOverride?: {
    totalPeople: number;
    travelerNames: string[];
    payers: string[];
    responsibleParties: Record<string, string>;
  }) => {
    const membersPayload = membersOverride ?? {
      totalPeople,
      travelerNames,
      payers,
      responsibleParties,
    };
    const result = await createTripApi(buildAutoTripName(), membersPayload);
    if (result.status === 'success' && result.trip) {
      const tripsResult = await listTripsApi();
      if (tripsResult.status === 'success') {
        setServerTrips(tripsResult.trips);
      }
      await loadTripDetails(result.trip);
      setTripStatus('New trip created and selected.');
      return;
    }
    setTripStatus(result.message || 'Could not create trip.');
  };

  useEffect(() => {
    const savedMode = localStorage.getItem(STORAGE_KEYS.mode) as SessionMode;
    if (savedMode === 'user') {
      const token = localStorage.getItem(STORAGE_KEYS.token);
      const savedUser = localStorage.getItem(STORAGE_KEYS.user);
      if (!token || !savedUser) {
        localStorage.removeItem(STORAGE_KEYS.mode);
        return;
      }

      try {
        const parsedUser = JSON.parse(savedUser) as AuthUser;
        setCurrentUser(parsedUser);
        setSessionMode('user');
        setAuthView('choice');
      } catch {
        localStorage.removeItem(STORAGE_KEYS.mode);
        localStorage.removeItem(STORAGE_KEYS.user);
        localStorage.removeItem(STORAGE_KEYS.token);
      }
      return;
    }

    if (savedMode === 'guest') {
      setSessionMode('guest');
      const storedTripsRaw = localStorage.getItem(STORAGE_KEYS.guestTrips);
      const parsedTrips = storedTripsRaw ? JSON.parse(storedTripsRaw) as GuestTripSnapshot[] : [];
      setGuestTrips(parsedTrips);

      if (parsedTrips.length > 0) {
        const savedActiveId = localStorage.getItem(STORAGE_KEYS.guestActiveTripId);
        const selected = parsedTrips.find((trip) => trip.id === savedActiveId) || parsedTrips[0];
        setActiveGuestTripId(selected.id);
        setTotalPeople(selected.totalPeople);
        setTravelerNames(selected.travelerNames || []);
        setPayers(selected.payers || []);
        setResponsibleParties(selected.responsibleParties || {});
        setExpenses(selected.expenses || []);
        setSettlements(selected.settlements || []);
        setReceiptHistory(selected.receiptHistory || []);
      }
    }
  }, []);

  useEffect(() => {
    if (sessionMode !== 'user' || !currentUser) {
      return;
    }

    const bootUserSession = async () => {
      await loadServerTrips();
      const currentTrips = await listTripsApi();
      if (currentTrips.status !== 'success') {
        return;
      }

      const savedTripId = localStorage.getItem(STORAGE_KEYS.activeTripId);
      const selectedTrip = currentTrips.trips.find((trip) => trip.id === savedTripId) || currentTrips.trips[0];

      if (selectedTrip) {
        await loadTripDetails(selectedTrip);
      } else {
        await createAndActivateTrip({
          totalPeople: 0,
          travelerNames: [],
          payers: [],
          responsibleParties: {},
        });
      }
    };

    bootUserSession();
  }, [sessionMode, currentUser]);

  useEffect(() => {
    if (sessionMode !== 'guest' || !activeGuestTripId) {
      return;
    }

    const snapshot = toGuestSnapshot(activeGuestTripId, guestTrips.find((trip) => trip.id === activeGuestTripId)?.name);
    setGuestTrips((currentTrips) => {
      const existing = currentTrips.find((trip) => trip.id === activeGuestTripId);
      const nextTrips = existing
        ? currentTrips.map((trip) => (trip.id === activeGuestTripId ? snapshot : trip))
        : [snapshot, ...currentTrips];
      localStorage.setItem(STORAGE_KEYS.guestTrips, JSON.stringify(nextTrips));
      return nextTrips;
    });
  }, [
    sessionMode,
    activeGuestTripId,
    totalPeople,
    travelerNames,
    payers,
    responsibleParties,
    expenses,
    settlements,
    receiptHistory,
  ]);

  useEffect(() => {
    if (sessionMode !== null || authView === 'choice' || !googleButtonRef.current) {
      return;
    }

    if (!GOOGLE_CLIENT_ID) {
      setAuthStatus('Google Sign-In is not configured. Set VITE_GOOGLE_CLIENT_ID in your frontend .env file.');
      return;
    }

    const renderGoogleButton = () => {
      if (!window.google?.accounts?.id || !googleButtonRef.current) {
        return;
      }

      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: async (response: { credential?: string }) => {
          if (!response.credential) {
            setAuthStatus('Google sign-in did not return a token.');
            return;
          }

          setAuthLoading(true);
          const result = await loginWithGoogleIdToken(response.credential);
          setAuthLoading(false);

          if (result.status === 'success' && result.token && result.user) {
            localStorage.setItem(STORAGE_KEYS.mode, 'user');
            localStorage.setItem(STORAGE_KEYS.token, result.token);
            localStorage.setItem(STORAGE_KEYS.user, JSON.stringify(result.user));
            setCurrentUser(result.user);
            setSessionMode('user');
            setAuthStatus(null);
            return;
          }

          setAuthStatus(result.message || 'Google login failed.');
        },
      });

      googleButtonRef.current.innerHTML = '';
      window.google.accounts.id.renderButton(googleButtonRef.current, {
        theme: 'outline',
        size: 'large',
        width: 280,
        text: 'signin_with',
      });
    };

    if (!document.getElementById('google-gsi-script')) {
      const script = document.createElement('script');
      script.id = 'google-gsi-script';
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = renderGoogleButton;
      document.head.appendChild(script);
    } else {
      renderGoogleButton();
    }
  }, [authView, sessionMode]);

  // Update all people list when total people changes
  useEffect(() => {
    const newAllPeople = [];
    for (let i = 1; i <= totalPeople; i++) {
      const name = travelerNames[i - 1]?.trim();
      newAllPeople.push(name || `Person ${i}`);
    }
    setAllPeople(newAllPeople);

    setFoodOrders((currentFoodOrders) => {
      const nextFoodOrders = { ...currentFoodOrders };
      newAllPeople.forEach((person) => {
        if (!(person in nextFoodOrders)) {
          nextFoodOrders[person] = '';
        }
      });
      return nextFoodOrders;
    });
  }, [totalPeople, travelerNames]);

  useEffect(() => {
    setTravelerNames((currentNames) => {
      if (totalPeople <= 0) {
        return [];
      }
      const resized = [...currentNames];
      if (resized.length > totalPeople) {
        resized.length = totalPeople;
      }
      while (resized.length < totalPeople) {
        resized.push('');
      }
      return resized;
    });
  }, [totalPeople]);

  useEffect(() => {
    if (sessionMode !== 'user' || !activeTripId) {
      return;
    }

    const timer = window.setTimeout(async () => {
      await updateTripApi(activeTripId, {
        members: {
          totalPeople,
          travelerNames,
          payers,
          responsibleParties,
        },
      });
    }, 500);

    return () => window.clearTimeout(timer);
  }, [sessionMode, activeTripId, totalPeople, travelerNames, payers, responsibleParties]);

  useEffect(() => {
    if (totalPeople <= 0) {
      setResponsibleParties({});
      return;
    }

    setResponsibleParties((current) => {
      const validPeople = new Set(
        travelerNames
          .slice(0, totalPeople)
          .map((name) => name.trim())
          .filter((name) => name.length > 0)
      );

      if (validPeople.size === 0) {
        return {};
      }

      const next: Record<string, string> = {};
      Object.entries(current).forEach(([dependent, responsible]) => {
        if (validPeople.has(dependent) && validPeople.has(responsible) && dependent !== responsible) {
          next[dependent] = responsible;
        }
      });
      return next;
    });
  }, [totalPeople, travelerNames]);

  const filledTravelerNames = travelerNames
    .map((name) => name.trim())
    .filter((name) => name.length > 0);
  const hasFilledTravelerNames = totalPeople > 0 && filledTravelerNames.length === totalPeople;
  const canUseTravelerChooser = hasFilledTravelerNames && useTravelerChooserForPayers;
  const availablePayerChoices = filledTravelerNames.filter((name) => !payers.includes(name));

  useEffect(() => {
    if (!hasFilledTravelerNames) {
      setUseTravelerChooserForPayers(false);
      return;
    }

    setPayers((currentPayers) => {
      const normalized = currentPayers.filter((payer) => filledTravelerNames.includes(payer));
      return normalized.slice(0, totalPeople);
    });
  }, [hasFilledTravelerNames, filledTravelerNames, totalPeople]);

  useEffect(() => {
    if (!canUseTravelerChooser) {
      setNextPayerName('');
      return;
    }

    setNextPayerName((currentSelected) => {
      if (availablePayerChoices.length === 0) {
        return '';
      }

      if (currentSelected && availablePayerChoices.includes(currentSelected)) {
        return currentSelected;
      }

      return availablePayerChoices[0];
    });
  }, [canUseTravelerChooser, availablePayerChoices]);

  useEffect(() => {
    return () => {
      if (receiptPreviewUrl) {
        URL.revokeObjectURL(receiptPreviewUrl);
      }
    };
  }, [receiptPreviewUrl]);

  useEffect(() => {
    const loadModelStatus = async () => {
      const status = await checkModelStatus();
      setMlStatus(status);
    };

    loadModelStatus();
  }, []);

  const loadReceiptHistory = async () => {
    if (sessionMode === 'guest') {
      const activeGuestTrip = guestTrips.find((trip) => trip.id === activeGuestTripId);
      setReceiptHistory(activeGuestTrip?.receiptHistory || []);
      setReceiptHistoryStatus(null);
      return;
    }

    if (sessionMode !== 'user' || !activeTripId) {
      setReceiptHistory([]);
      setReceiptHistoryStatus('History is available after selecting a trip.');
      return;
    }

    setLoadingReceiptHistory(true);
    const response = await listTripReceipts();

    if (response.status === 'success') {
      setReceiptHistory(response.receipts);
      setReceiptHistoryStatus(null);
    } else {
      setReceiptHistory([]);
      setReceiptHistoryStatus(response.message || 'Could not load receipt history.');
    }

    setLoadingReceiptHistory(false);
  };

  // Add a new payer
  const addPayer = () => {
    if (payers.length >= totalPeople) {
      return;
    }

    if (canUseTravelerChooser) {
      const selectedPayer = (nextPayerName || availablePayerChoices[0] || '').trim();
      if (!selectedPayer || payers.includes(selectedPayer)) {
        return;
      }
      setPayers([...payers, selectedPayer]);
      return;
    }

    setPayers([...payers, `Person ${payers.length + 1}`]);
  };

  const removePayer = (index: number) => {
    const removedName = payers[index];
    const updatedPayers = payers.filter((_, payerIndex) => payerIndex !== index);
    setPayers(updatedPayers);

    setNewExpense((current) => {
      if (current.paidBy === removedName) {
        return { ...current, paidBy: '' };
      }
      return current;
    });
  };

  // Update payer name
  const updatePayerName = (index: number, name: string) => {
    const updatedPayers = [...payers];
    const oldName = updatedPayers[index];
    updatedPayers[index] = name;
    setPayers(updatedPayers);
    
    // Update food orders if name changed
    if (oldName !== name && oldName in foodOrders) {
      const newFoodOrders = { ...foodOrders };
      newFoodOrders[name] = newFoodOrders[oldName];
      delete newFoodOrders[oldName];
      setFoodOrders(newFoodOrders);
    }
  };

  const updateTravelerName = (index: number, name: string) => {
    const oldName = travelerNames[index]?.trim() || '';
    const nextName = name.trim();

    if (oldName && oldName !== nextName) {
      setResponsibleParties((current) => {
        const next = { ...current };
        if (next[oldName]) {
          next[nextName] = next[oldName];
          delete next[oldName];
        }

        Object.keys(next).forEach((dependent) => {
          if (next[dependent] === oldName) {
            next[dependent] = nextName;
          }
        });

        if (!nextName) {
          delete next[nextName];
        }
        return next;
      });
    }

    setTravelerNames((currentNames) => {
      const updated = [...currentNames];
      updated[index] = name;
      return updated;
    });
  };

  const updateResponsibleParty = (dependent: string, responsible: string) => {
    setResponsibleParties((current) => {
      const next = { ...current };
      if (!responsible || responsible === dependent) {
        delete next[dependent];
      } else {
        next[dependent] = responsible;
      }
      return next;
    });
  };

  const applyAuthSuccess = (token: string, user: AuthUser) => {
    localStorage.setItem(STORAGE_KEYS.mode, 'user');
    localStorage.setItem(STORAGE_KEYS.token, token);
    localStorage.setItem(STORAGE_KEYS.user, JSON.stringify(user));
    setCurrentUser(user);
    setSessionMode('user');
    setAuthStatus(null);
  };

  const handleAuthSubmit = async () => {
    setAuthLoading(true);
    setAuthStatus(null);

    if (authView === 'login') {
      const result = await loginWithEmail({
        email: authForm.email.trim(),
        password: authForm.password,
      });
      setAuthLoading(false);
      if (result.status === 'success' && result.token && result.user) {
        applyAuthSuccess(result.token, result.user);
      } else {
        setAuthStatus(result.message || 'Login failed');
      }
      return;
    }

    if (authView === 'signup') {
      const result = await registerWithEmail({
        name: authForm.name.trim(),
        email: authForm.email.trim(),
        password: authForm.password,
      });
      setAuthLoading(false);
      if (result.status === 'success' && result.token && result.user) {
        applyAuthSuccess(result.token, result.user);
      } else {
        setAuthStatus(result.message || 'Signup failed');
      }
      return;
    }

    setAuthLoading(false);
  };

  const enterGuestMode = () => {
    localStorage.setItem(STORAGE_KEYS.mode, 'guest');
    setSessionMode('guest');
    setCurrentUser(null);
    localStorage.removeItem(STORAGE_KEYS.token);
    localStorage.removeItem(STORAGE_KEYS.user);
    localStorage.removeItem(STORAGE_KEYS.activeTripId);

    const storedTripsRaw = localStorage.getItem(STORAGE_KEYS.guestTrips);
    const parsedTrips = storedTripsRaw ? JSON.parse(storedTripsRaw) as GuestTripSnapshot[] : [];
    if (parsedTrips.length > 0) {
      setGuestTrips(parsedTrips);
      const selected = parsedTrips[0];
      setActiveGuestTripId(selected.id);
      localStorage.setItem(STORAGE_KEYS.guestActiveTripId, selected.id);
      setTotalPeople(selected.totalPeople);
      setTravelerNames(selected.travelerNames || []);
      setPayers(selected.payers || []);
      setResponsibleParties(selected.responsibleParties || {});
      setExpenses(selected.expenses || []);
      setSettlements(selected.settlements || []);
      setReceiptHistory(selected.receiptHistory || []);
      return;
    }

    resetTripState();
    const newId = crypto.randomUUID();
    setActiveGuestTripId(newId);
    localStorage.setItem(STORAGE_KEYS.guestActiveTripId, newId);
    setGuestTrips([]);
  };

  const handleLogout = () => {
    setSessionMode(null);
    setCurrentUser(null);
    setActiveTripId(null);
    setActiveGuestTripId(null);
    setServerTrips([]);
    setAuthView('choice');
    setAuthForm({ name: '', email: '', password: '' });
    setAuthStatus(null);
    localStorage.removeItem(STORAGE_KEYS.mode);
    localStorage.removeItem(STORAGE_KEYS.token);
    localStorage.removeItem(STORAGE_KEYS.user);
    localStorage.removeItem(STORAGE_KEYS.activeTripId);
    localStorage.removeItem(STORAGE_KEYS.guestActiveTripId);
    resetTripState();
  };

  const handleCreateNewTrip = async () => {
    if (creatingNewTrip) {
      return;
    }

    setCreatingNewTrip(true);
    try {
      if (sessionMode === 'user') {
        resetTripState();
        await createAndActivateTrip({
          totalPeople: 0,
          travelerNames: [],
          payers: [],
          responsibleParties: {},
        });
        return;
      }

      if (sessionMode === 'guest') {
        resetTripState();
        const newId = crypto.randomUUID();
        setActiveGuestTripId(newId);
        localStorage.setItem(STORAGE_KEYS.guestActiveTripId, newId);
        setTripStatus('New guest trip started.');
      }
    } finally {
      setCreatingNewTrip(false);
    }
  };

  const handleSwitchServerTrip = async (tripId: string) => {
    const selectedTrip = serverTrips.find((trip) => trip.id === tripId);
    if (!selectedTrip) {
      return;
    }

    resetTripState();
    await loadTripDetails(selectedTrip);
    setTripStatus(`Loaded ${selectedTrip.name}`);
  };

  const handleSwitchGuestTrip = (tripId: string) => {
    const selectedTrip = guestTrips.find((trip) => trip.id === tripId);
    if (!selectedTrip) {
      return;
    }

    setActiveGuestTripId(selectedTrip.id);
    localStorage.setItem(STORAGE_KEYS.guestActiveTripId, selectedTrip.id);
    setTotalPeople(selectedTrip.totalPeople);
    setTravelerNames(selectedTrip.travelerNames || []);
    setPayers(selectedTrip.payers || []);
    setResponsibleParties(selectedTrip.responsibleParties || {});
    setExpenses(selectedTrip.expenses || []);
    setSettlements(selectedTrip.settlements || []);
    setReceiptHistory(selectedTrip.receiptHistory || []);
    setTripStatus(`Loaded ${selectedTrip.name}`);
  };

  const handleSaveTripDetails = async () => {
    if (savingTrip) {
      return;
    }

    setSavingTrip(true);
    try {
      if (sessionMode === 'user') {
        if (!activeTripId) {
          setTripStatus('Select a trip before saving.');
          return;
        }

        const result = await updateTripApi(activeTripId, {
          members: {
            totalPeople,
            travelerNames,
            payers,
            responsibleParties,
          },
        });

        if (result.status === 'success') {
          setTripStatus('Trip details saved.');
        } else {
          setTripStatus(result.message || 'Could not save trip details.');
        }
        return;
      }

      if (sessionMode === 'guest') {
        if (!activeGuestTripId) {
          setTripStatus('Start or select a guest trip before saving.');
          return;
        }

        const snapshot = toGuestSnapshot(
          activeGuestTripId,
          guestTrips.find((trip) => trip.id === activeGuestTripId)?.name
        );

        setGuestTrips((currentTrips) => {
          const existing = currentTrips.find((trip) => trip.id === activeGuestTripId);
          const nextTrips = existing
            ? currentTrips.map((trip) => (trip.id === activeGuestTripId ? snapshot : trip))
            : [snapshot, ...currentTrips];
          localStorage.setItem(STORAGE_KEYS.guestTrips, JSON.stringify(nextTrips));
          return nextTrips;
        });

        setTripStatus('Guest trip details saved locally.');
      }
    } finally {
      setSavingTrip(false);
    }
  };

  const beginRenameTrip = () => {
    const activeName = sessionMode === 'user'
      ? serverTrips.find((trip) => trip.id === activeTripId)?.name || ''
      : guestTrips.find((trip) => trip.id === activeGuestTripId)?.name || '';

    if (!activeName) {
      return;
    }

    setRenameTripDraft(activeName);
    setRenamingTrip(true);
  };

  const cancelRenameTrip = () => {
    setRenamingTrip(false);
    setRenameTripDraft('');
  };

  const formatSavedTime = (iso: string) =>
    new Date(iso).toLocaleTimeString([], {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

  const saveRenamedTrip = async () => {
    const nextName = renameTripDraft.trim();
    if (!nextName) {
      setTripStatus('Trip name cannot be empty.');
      return;
    }

    setRenameTripLoading(true);
    try {
      if (sessionMode === 'user' && activeTripId) {
        const result = await updateTripApi(activeTripId, { name: nextName });
        if (result.status !== 'success') {
          setTripStatus(result.message || 'Could not rename trip.');
          return;
        }

        setServerTrips((current) =>
          current.map((trip) => (trip.id === activeTripId ? { ...trip, name: nextName } : trip))
        );
        setTripLastSavedAt(new Date().toISOString());
        setTripStatus(`Trip renamed to ${nextName}`);
        setRenamingTrip(false);
        return;
      }

      if (sessionMode === 'guest' && activeGuestTripId) {
        setGuestTrips((currentTrips) => {
          const nextTrips = currentTrips.map((trip) =>
            trip.id === activeGuestTripId
              ? {
                  ...trip,
                  name: nextName,
                  updatedAt: new Date().toISOString(),
                }
              : trip
          );
          localStorage.setItem(STORAGE_KEYS.guestTrips, JSON.stringify(nextTrips));
          return nextTrips;
        });
        setTripLastSavedAt(new Date().toISOString());
        setTripStatus(`Trip renamed to ${nextName}`);
        setRenamingTrip(false);
      }
    } finally {
      setRenameTripLoading(false);
    }
  };

  useEffect(() => {
    setRenamingTrip(false);
    setRenameTripDraft('');
  }, [sessionMode, activeTripId, activeGuestTripId]);

  useEffect(() => {
    setTripLastSavedAt(null);
  }, [sessionMode, activeTripId, activeGuestTripId]);

  // Update food order amount
  const updateFoodOrder = (person: string, amount: string) => {
    setFoodOrders({
      ...foodOrders,
      [person]: amount
    });
  };

  const suggestPersonForItem = (label: string) => {
    const normalized = label.toLowerCase();
    for (const person of allPeople) {
      const personKey = person.toLowerCase();
      if (normalized.includes(`@${personKey}`) || normalized.includes(`#${personKey}`) || normalized.includes(personKey)) {
        return person;
      }
    }
    return '';
  };

  const parseReceiptText = (text: string) => {
    const lines = text
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean);
    const excludedTokens = [
      'subtotal', 'total', 'tax', 'tip', 'amount', 'balance', 'cash', 'change', 'card',
      'visa', 'mastercard', 'amex', 'gratuity', 'service', 'rounding', 'discount',
      'coupon', 'member', 'loyalty', 'order', 'server', 'table', 'check', 'receipt',
      'invoice', 'item count', 'items', 'qty', 'quantity', 'price', 'unit', 'vat',
      'gst', 'sgst', 'cgst', 'igst', 'paymode', 'received', 'net amount', 'round off',
      'bill', 'balance', 'payment', 'refund', 'dine in', 'served', 'cover', 'cashier',
      'tax summary', 'inclusive', 'change', 'myr', 'prn', 'now', 'i/c', 'prun'
    ];
    const headerPattern = /(product|item)\s+name|product name|item name/i;
    const columnPattern = /(qty|quantity|mrp|rate|price|amount)/i;

    const cleanItemName = (raw: string) => {
      return raw
        .replace(/^[*#-]+\s*/g, '')
        .replace(/\b\d+\s*x\b/gi, '')
        .replace(/\bqty\s*:?\s*\d+\b/gi, '')
        .replace(/^\d+\.\d+\s*/g, '')
        .replace(/^\d+\s+/g, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
    };

    const isLikelyItemLine = (label: string, amountText: string) => {
      const lower = label.toLowerCase();
      if (excludedTokens.some(token => lower.includes(token))) return false;
      if (/^\d+$/.test(label)) return false;
      if (label.length < 2) return false;
      if (/\b\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\b/.test(label)) return false;
      if (/\b\d{2}:\d{2}\b/.test(label)) return false;
      if (/\b(auth|approval|transaction|terminal|merchant|ref|trace|phone|ph)\b/i.test(label)) return false;
      if (/%/.test(amountText)) return false;
      return true;
    };

    const extractAmountFromLine = (line: string) => {
      const matches = line.match(/[\d.]+/g) || [];
      if (matches.length === 0) return null;
      for (let i = matches.length - 1; i >= 0; i--) {
        const amt = parseFloat(matches[i]);
        if (amt > 0.5 && amt < 100000) {
          return amt;
        }
      }
      return null;
    };

    const parseLines = (requireSection: boolean) => {
      let inItemsSection = !requireSection;
      const items: ReceiptItem[] = [];
      const seenNames = new Set<string>();

      lines.forEach((line, index) => {
        const lower = line.toLowerCase();
        if (requireSection && !inItemsSection && headerPattern.test(line) && columnPattern.test(line)) {
          inItemsSection = true;
          return;
        }

        if (!inItemsSection) return;

        if (excludedTokens.some(token => lower.includes(token))) {
          if (items.length > 0) {
            inItemsSection = false;
          }
          return;
        }

        const numericMatches = line.match(/[0-9]+(?:\.[0-9]{1,2})?/g) || [];
        if (numericMatches.length < 2) return;

        const firstNumberIndex = line.search(/[0-9]/);
        if (firstNumberIndex === -1) return;
        const rawName = line.slice(0, firstNumberIndex).replace(/[*#]/g, '').trim();
        const name = cleanItemName(rawName);
        const amount = extractAmountFromLine(line);
        if (!name || !amount || amount <= 0) return;
        if (!isLikelyItemLine(name, amount.toString())) return;
        if (seenNames.has(name.toLowerCase())) return;
        seenNames.add(name.toLowerCase());

        items.push({
          id: `${Date.now()}-${index}`,
          name,
          amount,
          assignedTo: suggestPersonForItem(name) || undefined
        });
      });

      return items;
    };

    const sectionItems = parseLines(true);
    if (sectionItems.length > 0) {
      return sectionItems;
    }

    return parseLines(false);
  };

  const hasWeakOcrText = (text: string) => {
    const trimmed = text.trim();
    if (trimmed.length < 20) return true;
    if (!/\d/.test(trimmed)) return true;
    if (trimmed.split(/\s+/).length < 4) return true;
    return false;
  };

  const runLocalOcrFallback = async (file: File) => {
    const result = await Tesseract.recognize(file, 'eng', {
      logger: (message) => {
        if (message.status === 'recognizing text' && typeof message.progress === 'number') {
          const progress = Math.round(20 + message.progress * 70);
          setOcrProgress(Math.min(progress, 95));
        }
      },
    });

    return result?.data?.text?.trim() || '';
  };

  const beginAreaSelection = (event: React.MouseEvent<HTMLDivElement>) => {
    const container = event.currentTarget;
    const bounds = container.getBoundingClientRect();
    const x = event.clientX - bounds.left;
    const y = event.clientY - bounds.top;

    setDrawStartPoint({ x, y });
    setSelectedAreaRect({ x, y, width: 0, height: 0 });
    setIsDrawingArea(true);
    setSelectedAreaStatus(null);
  };

  const updateAreaSelection = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!isDrawingArea || !drawStartPoint) return;
    const container = event.currentTarget;
    const bounds = container.getBoundingClientRect();
    const currentX = event.clientX - bounds.left;
    const currentY = event.clientY - bounds.top;

    const x = Math.min(drawStartPoint.x, currentX);
    const y = Math.min(drawStartPoint.y, currentY);
    const width = Math.abs(currentX - drawStartPoint.x);
    const height = Math.abs(currentY - drawStartPoint.y);

    setSelectedAreaRect({ x, y, width, height });
  };

  const endAreaSelection = () => {
    setIsDrawingArea(false);
    setDrawStartPoint(null);
    setSelectedAreaRect((current) => {
      if (!current) return null;
      if (current.width < 8 || current.height < 8) {
        return null;
      }
      return current;
    });
  };

  const readSelectedAreaText = async (): Promise<string> => {
    if (!receiptImage || !selectedAreaRect || !receiptImageRef.current) {
      throw new Error('Draw a selection on the receipt image first.');
    }

    const imageElement = receiptImageRef.current;
    const displayWidth = imageElement.clientWidth;
    const displayHeight = imageElement.clientHeight;
    if (displayWidth <= 0 || displayHeight <= 0) {
      throw new Error('Could not read image dimensions for selected area.');
    }

    const imageBitmap = await createImageBitmap(receiptImage);

    const scaleX = imageBitmap.width / displayWidth;
    const scaleY = imageBitmap.height / displayHeight;
    const sx = Math.max(0, Math.floor(selectedAreaRect.x * scaleX));
    const sy = Math.max(0, Math.floor(selectedAreaRect.y * scaleY));
    const sw = Math.max(1, Math.floor(selectedAreaRect.width * scaleX));
    const sh = Math.max(1, Math.floor(selectedAreaRect.height * scaleY));

    const cropWidth = Math.min(sw, imageBitmap.width - sx);
    const cropHeight = Math.min(sh, imageBitmap.height - sy);
    if (cropWidth <= 0 || cropHeight <= 0) {
      throw new Error('Selected area is outside the image bounds.');
    }

    const canvas = document.createElement('canvas');
    canvas.width = cropWidth;
    canvas.height = cropHeight;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Could not initialize canvas for area extraction.');
    }

    context.drawImage(imageBitmap, sx, sy, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
    const result = await Tesseract.recognize(canvas, 'eng');
    return result?.data?.text?.trim() || '';
  };

  const extractTotalFromSelectedArea = async () => {
    setSelectedAreaStatus('Reading selected area...');

    try {
      const selectedText = await readSelectedAreaText();
      const total = extractTotalFromTextLocal(selectedText);

      if (typeof total === 'number' && Number.isFinite(total) && total > 0) {
        setDetectedReceiptTotal(total);
        setSelectedAreaStatus(`Detected total from selected area: $${total.toFixed(2)}`);
      } else {
        setSelectedAreaStatus('Could not detect a total from the selected area. Try drawing tighter around the final total line.');
      }

      if (selectedText && selectedText.length > 0) {
        setOcrText((current) => {
          if (!current || current.trim().length === 0) {
            return selectedText;
          }
          return `${current}\n\n[Selected Area OCR]\n${selectedText}`;
        });
      }
    } catch (error) {
      setSelectedAreaStatus(error instanceof Error ? error.message : 'Failed to process selected area.');
    }
  };

  const extractDescriptionFromSelectedArea = async () => {
    setSelectedAreaStatus('Reading selected area for description...');

    try {
      const selectedText = await readSelectedAreaText();
      const cleaned = selectedText
        .replace(/\s+/g, ' ')
        .replace(/[|]{2,}/g, ' ')
        .trim();

      if (!cleaned) {
        setSelectedAreaStatus('Could not detect description text from selected area.');
        return;
      }

      setNewExpense((current) => ({
        ...current,
        description: cleaned,
      }));
      setSelectedAreaStatus('Description extracted from selected area and filled in Add Expense.');

      window.setTimeout(() => {
        expenseDescriptionRef.current?.focus();
      }, 0);
    } catch (error) {
      setSelectedAreaStatus(error instanceof Error ? error.message : 'Failed to extract description from selected area.');
    }
  };

  const extractTotalFromTextLocal = (text: string): number | null => {
    if (!text || !text.trim()) return null;

    const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const totalKeywords = ['grand total', 'total paid', 'amount paid', 'amount due', 'total due', 'net amount', 'balance due', 'total'];
    const excludedTokens = ['subtotal', 'sub total', 'tax', 'vat', 'gst', 'cgst', 'sgst', 'service charge', 'tip'];

    const extractAmounts = (line: string) => {
      const matches = line.match(/[0-9]+(?:\.[0-9]{1,2})?/g) || [];
      return matches
        .map((token) => Number(token))
        .filter((value) => Number.isFinite(value) && value > 0 && value < 100000);
    };

    for (const keyword of totalKeywords) {
      for (const line of [...lines].reverse()) {
        const lower = line.toLowerCase();
        if (!lower.includes(keyword)) continue;
        if (keyword === 'total' && excludedTokens.some((token) => lower.includes(token))) continue;
        const amounts = extractAmounts(line);
        if (amounts.length > 0) {
          return amounts[amounts.length - 1];
        }
      }
    }

    const tailAmounts = lines.slice(-8).flatMap(extractAmounts);
    if (tailAmounts.length > 0) {
      return Math.max(...tailAmounts);
    }

    return null;
  };

  const handleReceiptImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (receiptPreviewUrl) {
      URL.revokeObjectURL(receiptPreviewUrl);
    }
    const previewUrl = URL.createObjectURL(file);
    setReceiptImage(file);
    setReceiptPreviewUrl(previewUrl);
    setOcrText('');
    setReceiptItems([]);
    setOriginalReceiptItems([]);
    setDetectedReceiptTotal(null);
    setOriginalDetectedReceiptTotal(null);
    setSelectedAreaRect(null);
    setSelectedAreaStatus(null);
    setOcrStatus('idle');
    setOcrError(null);
    setFeedbackStatus(null);
    setReceiptPersistenceStatus(null);
    setSavedReceiptId(null);
  };

  const runOcr = async () => {
    if (!receiptImage) return;
    setOcrStatus('running');
    setOcrError(null);
    setFeedbackStatus(null);
    setReceiptPersistenceStatus(null);
    setOcrProgress(0);

    try {
      setOcrProgress(20);
      let text = '';
      let usedLocalFallback = false;
      let ocrConfidence = 0;

      const ocrResult = await analyzeReceiptOcr(receiptImage);
      if (ocrResult.status === 'success') {
        text = ocrResult.text || '';
        ocrConfidence = ocrResult.confidence || 0;
      }

      if (hasWeakOcrText(text)) {
        const fallbackText = await runLocalOcrFallback(receiptImage);
        if (fallbackText && !hasWeakOcrText(fallbackText)) {
          text = fallbackText;
          usedLocalFallback = true;
        }
      }

      if (!text || !text.trim()) {
        throw new Error(ocrResult.error || 'Could not read text from the receipt image.');
      }

      setOcrProgress(70);
      setOcrText(text);

      const parseResult = await parseReceiptItems(text);
      let detectedItems: ReceiptItem[] = [];
      const parsedTotal =
        typeof parseResult.total === 'number' && Number.isFinite(parseResult.total)
          ? parseResult.total
          : null;

      if (parseResult.status === 'success' && parseResult.items.length > 0) {
        detectedItems = buildReceiptItems(parseResult.items).map((item) => ({
          ...item,
          assignedTo: suggestPersonForItem(item.name) || undefined,
        }));
      } else {
        detectedItems = parseReceiptText(text);
      }

      setDetectedReceiptTotal(parsedTotal ?? extractTotalFromTextLocal(text));
      setOriginalDetectedReceiptTotal(parsedTotal ?? extractTotalFromTextLocal(text));

      setReceiptItems(detectedItems);
      setOriginalReceiptItems(detectedItems);

      if (sessionMode === 'user') {
        const savedReceipt = await createTripReceipt({
          imageUrl: receiptImage.name,
          ocrStatus: 'parsed',
          ocrText: text,
          ocrConfidence,
          parserConfidence: parseResult.status === 'success' ? parseResult.confidence : null,
          modelVersion: parseResult.status === 'success'
            ? `${parseResult.model}${usedLocalFallback ? '+local-ocr' : ''}`
            : 'local-fallback-parser',
          parsedItems: detectedItems.map((item) => ({
            name: item.name,
            amount: item.amount,
            assignedTo: item.assignedTo,
          })),
        });

        if (savedReceipt.status === 'success') {
          setSavedReceiptId(savedReceipt.receiptId || null);
          setReceiptPersistenceStatus('Receipt scan saved to trip history.');
          await loadReceiptHistory();
        } else {
          setReceiptPersistenceStatus(savedReceipt.message || 'Receipt not saved to trip history.');
        }
      } else {
        const localReceiptId = `guest-receipt-${Date.now()}`;
        setSavedReceiptId(localReceiptId);
        const localReceipt: StoredTripReceipt = {
          id: localReceiptId,
          trip_id: activeGuestTripId || 'guest',
          image_url: receiptImage.name,
          ocr_status: 'parsed',
          ocr_text: text,
          ocr_confidence: ocrConfidence,
          parser_confidence: parseResult.status === 'success' ? parseResult.confidence : null,
          model_version: parseResult.status === 'success'
            ? `${parseResult.model}${usedLocalFallback ? '+local-ocr' : ''}`
            : 'local-fallback-parser',
          parsed_items: detectedItems.map((item) => ({
            name: item.name,
            amount: item.amount,
            assignedTo: item.assignedTo,
          })),
          created_at: new Date().toISOString(),
        };

        setReceiptHistory((current) => [localReceipt, ...current]);
        setReceiptPersistenceStatus('Receipt scan saved to guest local history only.');
      }

      setMlStatus((currentStatus: ModelStatus | null) => {
        if (currentStatus?.status === 'ok') {
          return currentStatus;
        }
        return {
          status: 'ok',
          ocr_model: 'loaded',
          parser_model: 'loaded',
        };
      });

      if (usedLocalFallback) {
        setReceiptPersistenceStatus('ANI OCR text was weak. Local OCR fallback was used for better extraction.');
      }

      setOcrProgress(100);
      setOcrStatus('done');
    } catch (error) {
      setOcrStatus('error');
      setOcrError(error instanceof Error ? error.message : 'Failed to read the receipt. Try a clearer image or paste the text below.');
      setOcrProgress(0);
    }
  };

  const handleParseReceiptText = () => {
    const parsedItems = parseReceiptText(ocrText);
    const parsedTotal = extractTotalFromTextLocal(ocrText);
    setReceiptItems(parsedItems);
    setDetectedReceiptTotal(parsedTotal);
    if (originalReceiptItems.length === 0) {
      setOriginalReceiptItems(parsedItems);
      setOriginalDetectedReceiptTotal(parsedTotal);
    }
    setFeedbackStatus(null);
  };

  const updateReceiptItem = (id: string, updates: Partial<ReceiptItem>) => {
    setReceiptItems((items) => items.map((item) => (item.id === id ? { ...item, ...updates } : item)));
    setFeedbackStatus(null);
  };

  const addReceiptItemRow = () => {
    setReceiptItems((items) => ([
      ...items,
      {
        id: `${Date.now()}-${Math.random()}`,
        name: '',
        amount: 0,
        assignedTo: undefined,
      },
    ]));
    setFeedbackStatus(null);
  };

  const removeReceiptItemRow = (id: string) => {
    setReceiptItems((items) => items.filter((item) => item.id !== id));
    setFeedbackStatus(null);
  };

  const saveReceiptFeedback = async () => {
    if (receiptItems.length === 0 && (!detectedReceiptTotal || detectedReceiptTotal <= 0)) {
      setFeedbackStatus('No corrected data is available yet. Add or edit line items, or set a corrected total.');
      return;
    }

    setSubmittingFeedback(true);
    setFeedbackStatus(null);

    try {
      const originalItems = originalReceiptItems.map((item) => ({
        name: item.name,
        amount: item.amount,
      })).filter((item) => item.name.trim().length > 0 || item.amount > 0);
      const correctedItems = receiptItems.map((item) => ({
        name: item.name,
        amount: item.amount,
      })).filter((item) => item.name.trim().length > 0 || item.amount > 0);

      const computedOriginalTotal = originalItems.reduce((sum, item) => sum + item.amount, 0);
      const computedCorrectedTotal = correctedItems.reduce((sum, item) => sum + item.amount, 0);
      const originalTotal =
        originalDetectedReceiptTotal && originalDetectedReceiptTotal > 0
          ? originalDetectedReceiptTotal
          : computedOriginalTotal > 0
            ? computedOriginalTotal
            : undefined;
      const correctedTotal =
        detectedReceiptTotal && detectedReceiptTotal > 0
          ? detectedReceiptTotal
          : computedCorrectedTotal > 0
            ? computedCorrectedTotal
            : undefined;

      const response = await submitFeedback({
        receipt_id: `receipt_${Date.now()}`,
        original_parse: {
          items: originalItems,
          total: originalTotal,
        },
        corrected_parse: {
          items: correctedItems,
          total: correctedTotal,
        },
      });

      if (response.status === 'stored') {
        setFeedbackStatus('Corrections saved. Future retraining can use this receipt.');
        setOriginalReceiptItems(receiptItems);
        setOriginalDetectedReceiptTotal(detectedReceiptTotal);

        if (savedReceiptId && sessionMode === 'user') {
          const updatedReceipt = await updateTripReceipt(savedReceiptId, {
            ocrStatus: 'reviewed',
            parsedItems: receiptItems.map((item) => ({
              name: item.name,
              amount: item.amount,
              assignedTo: item.assignedTo,
            })),
          });

          if (updatedReceipt.status === 'success') {
            setReceiptPersistenceStatus('Receipt review synced to trip history.');
            await loadReceiptHistory();
          } else {
            setReceiptPersistenceStatus(updatedReceipt.message || 'Could not sync reviewed receipt to trip history.');
          }
        } else if (savedReceiptId && sessionMode === 'guest') {
          setReceiptHistory((current) =>
            current.map((receipt) =>
              receipt.id === savedReceiptId
                ? {
                    ...receipt,
                    ocr_status: 'reviewed',
                    parsed_items: receiptItems.map((item) => ({
                      name: item.name,
                      amount: item.amount,
                      assignedTo: item.assignedTo,
                    })),
                  }
                : receipt
            )
          );
          setReceiptPersistenceStatus('Receipt review synced to guest local history.');
        }
      } else {
        setFeedbackStatus(response.error || response.message || 'Could not save corrections.');
      }
    } catch (error) {
      setFeedbackStatus(error instanceof Error ? error.message : 'Could not save corrections.');
    } finally {
      setSubmittingFeedback(false);
    }
  };

  const applyParsedItemsToFoodExpense = () => {
    if (receiptItems.length === 0 && !detectedReceiptTotal) return;
    const totalsByPerson: { [person: string]: number } = {};
    allPeople.forEach(person => {
      totalsByPerson[person] = 0;
    });

    receiptItems.forEach(item => {
      if (item.assignedTo && totalsByPerson[item.assignedTo] !== undefined) {
        totalsByPerson[item.assignedTo] += item.amount;
      }
    });

    const extractedLineItemsTotal = Object.values(totalsByPerson).reduce((sum, value) => sum + value, 0);
    const resolvedReceiptTotal =
      detectedReceiptTotal && detectedReceiptTotal > 0
        ? detectedReceiptTotal
        : receiptItems.reduce((sum, item) => sum + item.amount, 0);

    if (resolvedReceiptTotal > extractedLineItemsTotal && allPeople.length > 0) {
      const sharedDelta = (resolvedReceiptTotal - extractedLineItemsTotal) / allPeople.length;
      allPeople.forEach((person) => {
        totalsByPerson[person] += sharedDelta;
      });
    }

    const updatedFoodOrders: { [person: string]: string } = {};
    allPeople.forEach(person => {
      const total = totalsByPerson[person];
      updatedFoodOrders[person] = total > 0 ? total.toFixed(2) : '';
    });

    const totalAmount = resolvedReceiptTotal;
    setNewExpense({
      description: 'Receipt - Food',
      amount: totalAmount > 0 ? totalAmount.toFixed(2) : '',
      paidBy: newExpense.paidBy || payers[0] || '',
      type: 'food'
    });
    setFoodOrders(updatedFoodOrders);
  };

  const applyDetectedAmountToExpense = () => {
    const resolvedReceiptTotal =
      detectedReceiptTotal && detectedReceiptTotal > 0
        ? detectedReceiptTotal
        : receiptItems.reduce((sum, item) => sum + item.amount, 0);

    if (resolvedReceiptTotal <= 0) {
      return;
    }

    setNewExpense((current) => ({
      ...current,
      amount: resolvedReceiptTotal.toFixed(2),
      paidBy: current.paidBy || payers[0] || '',
      type: 'regular',
    }));

    window.setTimeout(() => {
      expenseDescriptionRef.current?.focus();
    }, 0);
  };

  // Add expense
  const addExpense = async () => {
    if (newExpense.description && newExpense.amount && newExpense.paidBy) {
      const expense: Expense = {
        id: Date.now().toString(),
        description: newExpense.description,
        amount: parseFloat(newExpense.amount),
        paidBy: newExpense.paidBy,
        type: newExpense.type
      };

      if (newExpense.type === 'food') {
        const orders: { [person: string]: number } = {};
        let totalOrderAmount = 0;
        
        Object.entries(foodOrders).forEach(([person, amount]) => {
          const orderAmount = parseFloat(amount) || 0;
          if (orderAmount > 0) {
            orders[person] = orderAmount;
            totalOrderAmount += orderAmount;
          }
        });
        
        expense.foodOrders = orders;
        
        // Validate that food orders match the total amount
        if (Math.abs(totalOrderAmount - expense.amount) > 0.01) {
          alert(`Food orders total (${totalOrderAmount.toFixed(2)}) doesn't match the expense amount (${expense.amount.toFixed(2)}). Please adjust the individual orders.`);
          return;
        }
      }

      const nextExpenses = [...expenses, expense];
      setExpenses(nextExpenses);

      if (sessionMode === 'user' && activeTripId) {
        const result = await createTripExpenseApi(activeTripId, {
          description: expense.description,
          amount: expense.amount,
          paidBy: expense.paidBy,
          type: expense.type,
          foodOrders: expense.foodOrders,
        });

        if (result.status !== 'success') {
          setTripStatus(result.message || 'Expense saved locally, but failed to sync to server.');
        }
      }

      setNewExpense({ description: '', amount: '', paidBy: '', type: 'regular' });
      
      // Auto-calculate settlements after adding expense
      calculateSettlements();
      
      // Clear food orders for next expense
      const clearedOrders: { [person: string]: string } = {};
      allPeople.forEach(person => {
        clearedOrders[person] = '';
      });
      setFoodOrders(clearedOrders);
    }
  };

  // Delete expense
  const deleteExpense = (id: string) => {
    setExpenses(expenses.filter(expense => expense.id !== id));
  };

  // Calculate settlements
  const calculateSettlements = () => {
    // Calculate balances for each person
    const balances: { [key: string]: number } = {};
    
    // Initialize all people with zero balance
    allPeople.forEach(person => {
      balances[person] = 0;
    });
    
    expenses.forEach(expense => {
      if (expense.type === 'food' && expense.foodOrders) {
        // For food expenses, each person pays for their own order
        Object.entries(expense.foodOrders).forEach(([person, amount]) => {
          balances[person] -= amount; // Person owes this amount
        });
        balances[expense.paidBy] += expense.amount; // Payer gets credit for full amount
      } else {
        // For regular expenses, split equally among all people
        const perPersonShare = expense.amount / totalPeople;
        allPeople.forEach(person => {
          balances[person] -= perPersonShare; // Everyone owes their share
        });
        balances[expense.paidBy] += expense.amount; // Payer gets credit for full amount
      }
    });

    // Redirect dependent balances to their responsible party.
    Object.entries(responsibleParties).forEach(([dependent, responsible]) => {
      if (!balances.hasOwnProperty(dependent) || !balances.hasOwnProperty(responsible) || dependent === responsible) {
        return;
      }
      balances[responsible] += balances[dependent];
      balances[dependent] = 0;
    });
    
    // Calculate settlements
    const creditors = Object.entries(balances).filter(([, balance]) => balance > 0.01);
    const debtors = Object.entries(balances).filter(([, balance]) => balance < -0.01);
    
    const newSettlements: Settlement[] = [];
    
    // Create a copy of balances for settlement calculation
    const workingBalances = { ...balances };
    
    creditors.forEach(([creditor, creditAmount]) => {
      let remainingCredit = creditAmount;
      
      debtors.forEach(([debtor]) => {
        if (remainingCredit > 0.01 && workingBalances[debtor] < -0.01) {
          const settlementAmount = Math.min(remainingCredit, Math.abs(workingBalances[debtor]));
          if (settlementAmount > 0.01) {
            newSettlements.push({
              from: debtor,
              to: creditor,
              amount: settlementAmount
            });
            remainingCredit -= settlementAmount;
            workingBalances[debtor] += settlementAmount;
          }
        }
      });
    });
    
    setSettlements(newSettlements);
    setShowResults(true);
  };

  const totalExpenses = expenses.reduce((sum, expense) => sum + expense.amount, 0);
  const regularExpenses = expenses.filter(e => e.type === 'regular');
  const foodExpenses = expenses.filter(e => e.type === 'food');
  const totalRegularExpenses = regularExpenses.reduce((sum, expense) => sum + expense.amount, 0);
  const totalFoodExpenses = foodExpenses.reduce((sum, expense) => sum + expense.amount, 0);
  const perPersonRegularShare = totalPeople > 0 ? totalRegularExpenses / totalPeople : 0;
  const receiptItemsTotal = receiptItems.reduce((sum, item) => sum + item.amount, 0);
  const effectiveReceiptTotal = detectedReceiptTotal && detectedReceiptTotal > 0 ? detectedReceiptTotal : receiptItemsTotal;
  const assignedItemsTotal = receiptItems.reduce((sum, item) => sum + (item.assignedTo ? item.amount : 0), 0);
  const savedReceiptCount = receiptHistory.length;
  const savedParsedItemsCount = receiptHistory.reduce(
    (sum, receipt) => sum + (Array.isArray(receipt.parsed_items) ? receipt.parsed_items.length : 0),
    0
  );
  const savedParsedAmountTotal = receiptHistory.reduce(
    (sum, receipt) =>
      sum +
      (Array.isArray(receipt.parsed_items)
        ? receipt.parsed_items.reduce((innerSum, item) => innerSum + Number(item.amount || 0), 0)
        : 0),
    0
  );
  const receiptCoveragePercent =
    totalExpenses > 0 ? Math.min(100, (savedParsedAmountTotal / totalExpenses) * 100) : 0;

  const ocrConfidenceValues = receiptHistory
    .map((receipt) => receipt.ocr_confidence)
    .filter((value): value is number => typeof value === 'number');
  const parserConfidenceValues = receiptHistory
    .map((receipt) => receipt.parser_confidence)
    .filter((value): value is number => typeof value === 'number');
  const avgOcrConfidence =
    ocrConfidenceValues.length > 0
      ? ocrConfidenceValues.reduce((sum, value) => sum + value, 0) / ocrConfidenceValues.length
      : null;
  const avgParserConfidence =
    parserConfidenceValues.length > 0
      ? parserConfidenceValues.reduce((sum, value) => sum + value, 0) / parserConfidenceValues.length
      : null;

  const foodSpendByPerson = allPeople
    .map((person) => {
      const amount = foodExpenses.reduce((sum, expense) => {
        if (!expense.foodOrders) {
          return sum;
        }
        return sum + Number(expense.foodOrders[person] || 0);
      }, 0);
      return { person, amount };
    })
    .filter((entry) => entry.amount > 0)
    .sort((a, b) => b.amount - a.amount);

  const topReceiptItemsMap: Record<string, { count: number; amount: number }> = {};
  receiptHistory.forEach((receipt) => {
    if (!Array.isArray(receipt.parsed_items)) {
      return;
    }

    receipt.parsed_items.forEach((item) => {
      const name = item.name?.trim() || 'Unknown Item';
      const key = name.toLowerCase();
      if (!topReceiptItemsMap[key]) {
        topReceiptItemsMap[key] = { count: 0, amount: 0 };
      }
      topReceiptItemsMap[key].count += 1;
      topReceiptItemsMap[key].amount += Number(item.amount || 0);
    });
  });

  const topReceiptItems = Object.entries(topReceiptItemsMap)
    .map(([name, metrics]) => ({
      name,
      count: metrics.count,
      amount: metrics.amount,
    }))
    .sort((a, b) => b.count - a.count || b.amount - a.amount)
    .slice(0, 5);

  const getTotalFoodOrdersAmount = () => {
    return Object.values(foodOrders).reduce((sum, amount) => sum + (parseFloat(amount) || 0), 0);
  };

  if (sessionMode === null) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 p-4 flex items-center justify-center">
        <div className="w-full max-w-md bg-white/80 backdrop-blur-sm rounded-2xl p-6 shadow-xl border border-white/20">
          <h1 className="text-3xl font-bold text-gray-800 mb-2 text-center">Travel Expense Manager</h1>
          <p className="text-sm text-gray-600 mb-6 text-center">Login to save trip history on server, or continue as guest with local-only history.</p>

          {authView === 'choice' && (
            <div className="space-y-3">
              <button
                onClick={() => setAuthView('login')}
                className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all flex items-center justify-center gap-2"
              >
                <LogIn className="w-4 h-4" />
                Login
              </button>
              <button
                onClick={() => setAuthView('signup')}
                className="w-full px-4 py-3 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-all flex items-center justify-center gap-2"
              >
                <UserPlus className="w-4 h-4" />
                Sign Up
              </button>
              <button
                onClick={enterGuestMode}
                className="w-full px-4 py-3 bg-gray-700 text-white rounded-lg hover:bg-gray-800 transition-all flex items-center justify-center gap-2"
              >
                <User className="w-4 h-4" />
                Continue as Guest
              </button>
            </div>
          )}

          {(authView === 'login' || authView === 'signup') && (
            <div className="space-y-3">
              {authView === 'signup' && (
                <input
                  type="text"
                  placeholder="Name"
                  value={authForm.name}
                  onChange={(e) => setAuthForm((current) => ({ ...current, name: e.target.value }))}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              )}
              <input
                type="email"
                placeholder="Email"
                value={authForm.email}
                onChange={(e) => setAuthForm((current) => ({ ...current, email: e.target.value }))}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
              <input
                type="password"
                placeholder="Password"
                value={authForm.password}
                onChange={(e) => setAuthForm((current) => ({ ...current, password: e.target.value }))}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />

              <button
                onClick={handleAuthSubmit}
                disabled={authLoading}
                className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all disabled:opacity-60"
              >
                {authLoading ? 'Please wait...' : authView === 'login' ? 'Login' : 'Create Account'}
              </button>

              <div className="pt-1">
                <div ref={googleButtonRef} className="flex justify-center" />
              </div>

              <button
                onClick={() => {
                  setAuthView('choice');
                  setAuthStatus(null);
                }}
                className="w-full px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
              >
                Back
              </button>
            </div>
          )}

          {authStatus && <p className="mt-3 text-sm text-red-600">{authStatus}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 p-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="relative mb-8">
          {/* Logo and company name in top-left */}
          <div className="absolute left-0 top-0 flex flex-col items-start">
            <img
              src="../../assets/S_Logo.png"
              alt="App Logo"
              width={80}
              className="mb-1"
            />
            <span className="text-xs text-gray-500 font-semibold pl-1">SP ByteVerse Pvt. Ltd.</span>
          </div>
          {/* App title and subtitle centered */}
          <div className="flex flex-col items-center">
            <h1 className="text-4xl font-bold text-gray-800 mb-2">Travel Expense Manager</h1>
            <p className="text-gray-600">Split expenses fairly among travelers with individual food tracking</p>
          </div>
        </div>

        <div className="bg-white/70 backdrop-blur-sm rounded-2xl p-4 shadow-xl border border-white/20 mb-6">
          <div className="flex flex-col lg:flex-row lg:items-center gap-3 lg:justify-between">
            <div className="text-sm text-gray-700">
              {sessionMode === 'user' ? (
                <span>Signed in as <strong>{currentUser?.name}</strong> ({currentUser?.email})</span>
              ) : (
                <span>Guest mode: history is stored only in this browser.</span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {sessionMode === 'user' ? (
                <>
                  <select
                    value={activeTripId || ''}
                    onChange={(e) => handleSwitchServerTrip(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    disabled={loadingTrips || serverTrips.length === 0}
                  >
                    {serverTrips.map((trip) => (
                      <option key={trip.id} value={trip.id}>{trip.name}</option>
                    ))}
                  </select>
                  <button
                    onClick={handleCreateNewTrip}
                    disabled={creatingNewTrip}
                    className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {creatingNewTrip ? 'Creating...' : 'New Trip'}
                  </button>
                  <button
                    onClick={loadServerTrips}
                    className="px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 transition-all"
                  >
                    Refresh Trips
                  </button>
                  <button
                    onClick={handleSaveTripDetails}
                    disabled={savingTrip || !activeTripId}
                    className="px-3 py-2 bg-teal-600 text-white rounded-lg text-sm hover:bg-teal-700 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {savingTrip ? 'Saving...' : 'Save Trip'}
                  </button>
                  {tripLastSavedAt && (
                    <span className="text-xs text-gray-600">Last saved at {formatSavedTime(tripLastSavedAt)}</span>
                  )}
                  <button
                    onClick={beginRenameTrip}
                    disabled={!activeTripId || renameTripLoading}
                    className="px-3 py-2 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    Rename Trip
                  </button>
                </>
              ) : (
                <>
                  <select
                    value={activeGuestTripId || ''}
                    onChange={(e) => handleSwitchGuestTrip(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    disabled={guestTrips.length === 0}
                  >
                    {guestTrips.map((trip) => (
                      <option key={trip.id} value={trip.id}>{trip.name}</option>
                    ))}
                  </select>
                  <button
                    onClick={handleCreateNewTrip}
                    disabled={creatingNewTrip}
                    className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {creatingNewTrip ? 'Creating...' : 'New Guest Trip'}
                  </button>
                  <button
                    onClick={beginRenameTrip}
                    disabled={!activeGuestTripId || renameTripLoading}
                    className="px-3 py-2 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    Rename Trip
                  </button>
                  <button
                    onClick={handleSaveTripDetails}
                    disabled={savingTrip || !activeGuestTripId}
                    className="px-3 py-2 bg-teal-600 text-white rounded-lg text-sm hover:bg-teal-700 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {savingTrip ? 'Saving...' : 'Save Trip'}
                  </button>
                  {tripLastSavedAt && (
                    <span className="text-xs text-gray-600">Last saved at {formatSavedTime(tripLastSavedAt)}</span>
                  )}
                </>
              )}

              <button
                onClick={handleLogout}
                className="px-3 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-100 transition-all flex items-center gap-1"
              >
                <LogOut className="w-4 h-4" />
                Exit
              </button>
            </div>
          </div>
          {renamingTrip && (
            <div className="mt-3 p-3 rounded-lg border border-emerald-200 bg-emerald-50">
              <label className="block text-sm font-medium text-emerald-800 mb-2">New Trip Name</label>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={renameTripDraft}
                  onChange={(e) => setRenameTripDraft(e.target.value)}
                  className="flex-1 px-3 py-2 border border-emerald-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  placeholder="Enter trip name"
                  maxLength={80}
                />
                <button
                  onClick={saveRenamedTrip}
                  disabled={renameTripLoading}
                  className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-all disabled:opacity-60"
                >
                  {renameTripLoading ? 'Saving...' : 'Save'}
                </button>
                <button
                  onClick={cancelRenameTrip}
                  disabled={renameTripLoading}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-all disabled:opacity-60"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
          {tripStatus && <p className="mt-2 text-sm text-gray-700">{tripStatus}</p>}
        </div>

        <div className="bg-white/70 backdrop-blur-sm rounded-2xl p-6 shadow-xl border border-white/20 mb-6">
          <h2 className="text-xl font-semibold text-gray-800 mb-3 flex items-center gap-2">
            <History className="w-5 h-5 text-indigo-600" />
            Past Trips
          </h2>

          {sessionMode === 'user' ? (
            serverTrips.length === 0 ? (
              <p className="text-sm text-gray-600">No saved trips yet.</p>
            ) : (
              <div className="space-y-2">
                {serverTrips.map((trip) => (
                  <button
                    key={trip.id}
                    onClick={() => handleSwitchServerTrip(trip.id)}
                    className={`w-full text-left px-3 py-2 rounded-lg border transition-all ${
                      activeTripId === trip.id
                        ? 'border-indigo-300 bg-indigo-50 text-indigo-800'
                        : 'border-gray-200 bg-white text-gray-700 hover:border-indigo-200'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{trip.name}</span>
                      <span className="text-xs text-gray-500">{new Date(trip.created_at).toLocaleString()}</span>
                    </div>
                  </button>
                ))}
              </div>
            )
          ) : (
            guestTrips.length === 0 ? (
              <p className="text-sm text-gray-600">No guest trips yet. Start one and it will be kept in browser storage only.</p>
            ) : (
              <div className="space-y-2">
                {guestTrips.map((trip) => (
                  <button
                    key={trip.id}
                    onClick={() => handleSwitchGuestTrip(trip.id)}
                    className={`w-full text-left px-3 py-2 rounded-lg border transition-all ${
                      activeGuestTripId === trip.id
                        ? 'border-indigo-300 bg-indigo-50 text-indigo-800'
                        : 'border-gray-200 bg-white text-gray-700 hover:border-indigo-200'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{trip.name}</span>
                      <span className="text-xs text-gray-500">{new Date(trip.updatedAt).toLocaleString()}</span>
                    </div>
                  </button>
                ))}
              </div>
            )
          )}
        </div>

        {/* Setup Section */}
        <div className="bg-white/70 backdrop-blur-sm rounded-2xl p-6 shadow-xl border border-white/20 mb-6">
          <h2 className="text-2xl font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <Users className="w-6 h-6 text-blue-600" />
            Trip Setup
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Total Number of Travelers
              </label>
              <input
                ref={totalTravelersInputRef}
                type="number"
                value={totalPeople}
                onChange={(e) => setTotalPeople(parseInt(e.target.value) || 0)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                placeholder="Enter number of people"
                min="1"
              />

              {totalPeople > 0 && (
                <div className="mt-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Traveller Names
                  </label>
                  <div className="space-y-2">
                    {Array.from({ length: totalPeople }).map((_, index) => (
                      <input
                        key={`traveller-${index}`}
                        type="text"
                        value={travelerNames[index] || ''}
                        onChange={(e) => updateTravelerName(index, e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                        placeholder={`Traveller ${index + 1} name`}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                People Who Paid Expenses
              </label>
              <div className="space-y-2">
                {hasFilledTravelerNames && (
                  <button
                    onClick={() => setUseTravelerChooserForPayers((enabled) => !enabled)}
                    className="w-full px-3 py-2 border border-blue-200 rounded-lg text-blue-700 bg-blue-50 hover:bg-blue-100 transition-all text-sm font-medium"
                  >
                    {canUseTravelerChooser ? 'Use Manual Payer Entry' : 'Choose Payers from Travellers'}
                  </button>
                )}

                {payers.map((payer, index) => (
                  <div key={index} className="flex gap-2">
                    {canUseTravelerChooser ? (
                      <select
                        value={payer}
                        onChange={(e) => updatePayerName(index, e.target.value)}
                        className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                      >
                        {filledTravelerNames
                          .filter((name) => name === payer || !payers.includes(name))
                          .map((name) => (
                            <option key={name} value={name}>{name}</option>
                          ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={payer}
                        onChange={(e) => updatePayerName(index, e.target.value)}
                        className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                        placeholder={`Person ${index + 1} name`}
                      />
                    )}
                    <button
                      onClick={() => removePayer(index)}
                      className="px-3 py-2 border border-red-200 rounded-lg text-red-600 hover:bg-red-50 transition-all flex items-center justify-center"
                      aria-label={`Remove payer ${payer}`}
                      title="Remove payer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                {payers.length < totalPeople && (
                  canUseTravelerChooser ? (
                    <div className="flex gap-2">
                      <select
                        value={nextPayerName}
                        onChange={(e) => setNextPayerName(e.target.value)}
                        className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                      >
                        {availablePayerChoices.map((name) => (
                          <option key={name} value={name}>{name}</option>
                        ))}
                      </select>
                      <button
                        onClick={addPayer}
                        className="px-4 py-2 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-blue-500 hover:text-blue-600 transition-all flex items-center justify-center gap-2"
                        disabled={availablePayerChoices.length === 0}
                      >
                        <Plus className="w-4 h-4" />
                        Add Payer
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={addPayer}
                      className="w-full px-4 py-2 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-blue-500 hover:text-blue-600 transition-all flex items-center justify-center gap-2"
                    >
                      <Plus className="w-4 h-4" />
                      Add Payer
                    </button>
                  )
                )}
              </div>

              {filledTravelerNames.length > 1 && (
                <div className="mt-4 p-3 border border-emerald-200 rounded-lg bg-emerald-50">
                  <p className="text-sm font-semibold text-emerald-800 mb-2">Responsible Party Links (Optional)</p>
                  <p className="text-xs text-emerald-700 mb-3">
                    If a traveller is linked, their final balance is transferred to the responsible person.
                  </p>
                  <div className="space-y-2">
                    {filledTravelerNames.map((dependent) => (
                      <div key={`relation-${dependent}`} className="flex items-center gap-2">
                        <span className="text-sm text-gray-700 min-w-[90px]">{dependent}</span>
                        <span className="text-xs text-gray-500">covered by</span>
                        <select
                          value={responsibleParties[dependent] || ''}
                          onChange={(e) => updateResponsibleParty(dependent, e.target.value)}
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all text-sm"
                        >
                          <option value="">No link</option>
                          {filledTravelerNames
                            .filter((name) => name !== dependent)
                            .map((name) => (
                              <option key={`${dependent}-to-${name}`} value={name}>{name}</option>
                            ))}
                        </select>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Receipt Scan Section */}
        {payers.length > 0 && (
          <div className="bg-white/70 backdrop-blur-sm rounded-2xl p-6 shadow-xl border border-white/20 mb-6">
            <h2 className="text-2xl font-semibold text-gray-800 mb-2 flex items-center gap-2">
              <ScanLine className="w-6 h-6 text-purple-600" />
              Receipt Scan (Beta)
            </h2>
            <p className="text-sm text-gray-600 mb-4">
              Upload or snap a receipt and let OCR auto-fill line items. Add tags like @Alex or #Sam in the text to suggest who ordered what.
            </p>
            {mlStatus && mlStatus.status === 'ok' ? (
              <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
                ANI service connected. OCR: {mlStatus.ocr_model}. Parser: {mlStatus.parser_model}.
              </div>
            ) : (
              <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                ANI service is unavailable right now. You can still paste receipt text manually and parse it locally.
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Receipt Image</label>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleReceiptImageChange}
                  className="block w-full text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-purple-600 file:text-white hover:file:bg-purple-700"
                />
                {receiptPreviewUrl && (
                  <div className="mt-3">
                    <div
                      className="relative inline-block border border-gray-200 rounded-lg overflow-hidden select-none"
                      onMouseDown={beginAreaSelection}
                      onMouseMove={updateAreaSelection}
                      onMouseUp={endAreaSelection}
                      onMouseLeave={endAreaSelection}
                    >
                      <img
                        ref={receiptImageRef}
                        src={receiptPreviewUrl}
                        alt="Receipt preview"
                        className="max-h-64 object-contain"
                        draggable={false}
                      />
                      {selectedAreaRect && (
                        <div
                          className="absolute border-2 border-purple-500 bg-purple-500/10 pointer-events-none"
                          style={{
                            left: `${selectedAreaRect.x}px`,
                            top: `${selectedAreaRect.y}px`,
                            width: `${selectedAreaRect.width}px`,
                            height: `${selectedAreaRect.height}px`,
                          }}
                        />
                      )}
                    </div>
                    <p className="mt-2 text-xs text-gray-600">
                      Tip: drag and draw around the bill&apos;s final total line, then click "Extract Total from Selected Area".
                    </p>
                  </div>
                )}
                <button
                  onClick={runOcr}
                  disabled={!receiptImage || ocrStatus === 'running'}
                  type="button"
                  className="mt-3 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {ocrStatus === 'running' ? 'Scanning...' : 'Run ANI OCR'}
                </button>
                <button
                  onClick={extractTotalFromSelectedArea}
                  disabled={!receiptImage || !selectedAreaRect}
                  type="button"
                  className="mt-3 ml-0 md:ml-3 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  Extract Total from Selected Area
                </button>
                <button
                  onClick={extractDescriptionFromSelectedArea}
                  disabled={!receiptImage || !selectedAreaRect}
                  type="button"
                  className="mt-3 ml-0 md:ml-3 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  Extract Description from Selected Area
                </button>
                {ocrStatus === 'running' && (
                  <p className="mt-2 text-sm text-gray-600">Progress: {ocrProgress}%</p>
                )}
                {selectedAreaStatus && (
                  <p className="mt-2 text-sm text-indigo-700">{selectedAreaStatus}</p>
                )}
                {ocrStatus === 'error' && ocrError && (
                  <p className="mt-2 text-sm text-red-600">{ocrError}</p>
                )}
                {ocrStatus === 'done' && (
                  <p className="mt-2 text-sm text-green-600">OCR complete. Review the text and parsed items.</p>
                )}
                {receiptPersistenceStatus && (
                  <p className="mt-2 text-sm text-gray-700">{receiptPersistenceStatus}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Receipt Text</label>
                <textarea
                  value={ocrText}
                  onChange={(e) => setOcrText(e.target.value)}
                  rows={10}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                  placeholder="Paste receipt text here if OCR is unavailable"
                />
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    onClick={handleParseReceiptText}
                    type="button"
                    className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-all"
                  >
                    Parse Line Items Locally
                  </button>
                  <button
                    onClick={() => {
                      setOcrText('');
                      setReceiptItems([]);
                      setOriginalReceiptItems([]);
                      setDetectedReceiptTotal(null);
                      setOriginalDetectedReceiptTotal(null);
                      setSelectedAreaRect(null);
                      setSelectedAreaStatus(null);
                      setFeedbackStatus(null);
                      setReceiptPersistenceStatus(null);
                      setSavedReceiptId(null);
                    }}
                    type="button"
                    className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-all"
                  >
                    Clear
                  </button>
                </div>
              </div>
            </div>

            {(receiptItems.length > 0 || (detectedReceiptTotal && detectedReceiptTotal > 0)) && (
              <div className="mt-6">
                <h3 className="text-lg font-semibold text-gray-800 mb-3">Detected Receipt Details</h3>
                <div className="space-y-2">
                  {receiptItems.map((item) => (
                    <div key={item.id} className="grid grid-cols-1 md:grid-cols-12 gap-2 items-center">
                      <input
                        type="text"
                        value={item.name}
                        onChange={(e) => updateReceiptItem(item.id, { name: e.target.value, assignedTo: item.assignedTo || suggestPersonForItem(e.target.value) || undefined })}
                        className="md:col-span-5 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      />
                      <input
                        type="number"
                        value={item.amount}
                        onChange={(e) => updateReceiptItem(item.id, { amount: parseFloat(e.target.value) || 0 })}
                        className="md:col-span-2 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        step="0.01"
                      />
                      <select
                        value={item.assignedTo || ''}
                        onChange={(e) => updateReceiptItem(item.id, { assignedTo: e.target.value || undefined })}
                        className="md:col-span-3 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      >
                        <option value="">Unassigned</option>
                        {allPeople.map((person) => (
                          <option key={person} value={person}>{person}</option>
                        ))}
                      </select>
                      <button
                        onClick={() => removeReceiptItemRow(item.id)}
                        type="button"
                        className="md:col-span-2 px-3 py-2 bg-red-50 text-red-700 rounded-lg border border-red-200 hover:bg-red-100 transition-all text-sm"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>

                <button
                  onClick={addReceiptItemRow}
                  type="button"
                  className="mt-3 px-4 py-2 bg-white text-gray-700 rounded-lg border border-gray-300 hover:bg-gray-50 transition-all"
                >
                  Add Line Item
                </button>

                <div className="mt-3 p-3 bg-purple-50 rounded-lg border border-purple-200">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Detected total paid:</span>
                    <div className="flex items-center gap-2">
                      <span className="text-gray-500">$</span>
                      <input
                        type="number"
                        value={detectedReceiptTotal ?? ''}
                        onChange={(e) => {
                          const value = parseFloat(e.target.value);
                          setDetectedReceiptTotal(Number.isFinite(value) ? value : null);
                          setFeedbackStatus(null);
                        }}
                        step="0.01"
                        className="w-28 px-2 py-1 border border-purple-200 rounded text-sm font-semibold text-gray-800 bg-white"
                        placeholder={effectiveReceiptTotal.toFixed(2)}
                      />
                    </div>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Items total:</span>
                    <span className="font-semibold text-gray-800">${receiptItemsTotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Assigned total:</span>
                    <span className="font-semibold text-gray-800">${assignedItemsTotal.toFixed(2)}</span>
                  </div>
                </div>

                <button
                  onClick={applyParsedItemsToFoodExpense}
                  type="button"
                  className="mt-3 px-5 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-all"
                >
                  Use for Food Expense
                </button>
                <button
                  onClick={applyDetectedAmountToExpense}
                  type="button"
                  className="mt-3 ml-0 md:ml-3 px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all"
                >
                  Use Amount in Expense
                </button>
                <button
                  onClick={saveReceiptFeedback}
                  disabled={submittingFeedback}
                  type="button"
                  className="mt-3 ml-0 md:ml-3 px-5 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-all disabled:opacity-60"
                >
                  {submittingFeedback ? 'Saving...' : 'Save Corrections for Training'}
                </button>
                {feedbackStatus && (
                  <p className={`mt-3 text-sm ${feedbackStatus.includes('saved') ? 'text-green-600' : 'text-gray-700'}`}>
                    {feedbackStatus}
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Receipt History Section
        {payers.length > 0 && (
          <div className="bg-white/70 backdrop-blur-sm rounded-2xl p-6 shadow-xl border border-white/20 mb-6">
            <div className="flex items-center justify-between gap-3 mb-4">
              <h2 className="text-2xl font-semibold text-gray-800 flex items-center gap-2">
                <Receipt className="w-6 h-6 text-indigo-600" />
                Receipt History
              </h2>
              <button
                onClick={loadReceiptHistory}
                disabled={loadingReceiptHistory}
                type="button"
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-all disabled:opacity-60"
              >
                {loadingReceiptHistory ? 'Refreshing...' : 'Refresh'}
              </button>
            </div>

            {receiptHistoryStatus && (
              <p className="mb-3 text-sm text-amber-700">{receiptHistoryStatus}</p>
            )}

            {receiptHistory.length === 0 ? (
              <p className="text-sm text-gray-600">No saved receipts yet for the active trip.</p>
            ) : (
              <div className="space-y-3">
                {receiptHistory.map((receipt) => (
                  <div key={receipt.id} className="rounded-lg border border-indigo-100 bg-indigo-50/60 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-medium text-gray-800">Receipt ID: {receipt.id}</p>
                      <p className="text-xs text-gray-600">{new Date(receipt.created_at).toLocaleString()}</p>
                    </div>
                    <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2 text-sm text-gray-700">
                      <p>Status: <span className="font-semibold">{receipt.ocr_status}</span></p>
                      <p>Model: <span className="font-semibold">{receipt.model_version || 'unknown'}</span></p>
                      <p>OCR confidence: <span className="font-semibold">{receipt.ocr_confidence ?? '-'}</span></p>
                      <p>Parser confidence: <span className="font-semibold">{receipt.parser_confidence ?? '-'}</span></p>
                    </div>

                    {Array.isArray(receipt.parsed_items) && receipt.parsed_items.length > 0 && (
                      <div className="mt-3">
                        <p className="text-sm font-medium text-gray-800 mb-2">Parsed Items</p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                          {receipt.parsed_items.map((item, index) => (
                            <div key={`${receipt.id}-${index}`} className="flex items-center justify-between rounded border border-indigo-200 bg-white px-3 py-2">
                              <span className="text-gray-700">{item.name}{item.assignedTo ? ` (${item.assignedTo})` : ''}</span>
                              <span className="font-semibold text-gray-900">${Number(item.amount || 0).toFixed(2)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )} */}

        {/* Add Expense Section */}
        {payers.length > 0 && (
          <div className="bg-white/70 backdrop-blur-sm rounded-2xl p-6 shadow-xl border border-white/20 mb-6">
            <h2 className="text-2xl font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <Receipt className="w-6 h-6 text-green-600" />
              Add Expense
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Description
                </label>
                <input
                  ref={expenseDescriptionRef}
                  type="text"
                  value={newExpense.description}
                  onChange={(e) => setNewExpense({...newExpense, description: e.target.value})}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all"
                  placeholder="e.g., Hotel, Food, Transport"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Amount
                </label>
                <input
                  type="number"
                  value={newExpense.amount}
                  onChange={(e) => setNewExpense({...newExpense, amount: e.target.value})}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all"
                  placeholder="0.00"
                  step="0.01"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Paid By
                </label>
                <select
                  value={newExpense.paidBy}
                  onChange={(e) => setNewExpense({...newExpense, paidBy: e.target.value})}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all"
                >
                  <option value="">Select payer</option>
                  {payers.map((payer, index) => (
                    <option key={index} value={payer}>{payer}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Expense Type
                </label>
                <select
                  value={newExpense.type}
                  onChange={(e) => setNewExpense({...newExpense, type: e.target.value as 'regular' | 'food'})}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all"
                >
                  <option value="regular">Regular (Split Equally)</option>
                  <option value="food">Food (Individual Orders)</option>
                </select>
              </div>
            </div>

            {/* Food Orders Section */}
            {newExpense.type === 'food' && (
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mb-4">
                <h3 className="text-lg font-semibold text-orange-800 mb-3 flex items-center gap-2">
                  <UtensilsCrossed className="w-5 h-5" />
                  Individual Food Orders
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {allPeople.map((person, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <label className="text-sm font-medium text-gray-700 min-w-0 flex-1">
                        {person}:
                      </label>
                      <input
                        type="number"
                        value={foodOrders[person] || ''}
                        onChange={(e) => updateFoodOrder(person, e.target.value)}
                        className="w-24 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all text-sm"
                        placeholder="0.00"
                        step="0.01"
                      />
                    </div>
                  ))}
                </div>
                <div className="mt-3 p-3 bg-white rounded-lg border border-orange-200">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-600">Total Orders:</span>
                    <span className="font-semibold text-gray-800">${getTotalFoodOrdersAmount().toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-600">Expense Amount:</span>
                    <span className="font-semibold text-gray-800">${(parseFloat(newExpense.amount) || 0).toFixed(2)}</span>
                  </div>
                  {Math.abs(getTotalFoodOrdersAmount() - (parseFloat(newExpense.amount) || 0)) > 0.01 && (
                    <div className="mt-2 text-sm text-red-600">
                      ⚠️ Orders total doesn't match expense amount
                    </div>
                  )}
                </div>
              </div>
            )}
            
            <button
              onClick={addExpense}
              className="w-full md:w-auto px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-all flex items-center justify-center gap-2 font-medium"
            >
              <Plus className="w-4 h-4" />
              Add Expense
            </button>
          </div>
        )}

        {/* Expenses List */}
        {expenses.length > 0 && (
          <div className="bg-white/70 backdrop-blur-sm rounded-2xl p-6 shadow-xl border border-white/20 mb-6">
            <h2 className="text-2xl font-semibold text-gray-800 mb-4">Expense List</h2>
            
            <div className="space-y-3">
              {expenses.map((expense) => (
                <div key={expense.id} className="p-4 bg-white/50 rounded-lg border border-gray-200">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2">
                          {expense.type === 'food' ? (
                            <UtensilsCrossed className="w-5 h-5 text-orange-600" />
                          ) : (
                            <DollarSign className="w-5 h-5 text-blue-600" />
                          )}
                          <div>
                            <p className="font-medium text-gray-800">{expense.description}</p>
                            <p className="text-sm text-gray-600">
                              Paid by {expense.paidBy} • {expense.type === 'food' ? 'Individual Orders' : 'Split Equally'}
                            </p>
                          </div>
                        </div>
                        <div className="text-right ml-auto">
                          <p className="text-xl font-bold text-gray-800">${expense.amount.toFixed(2)}</p>
                        </div>
                      </div>
                      
                      {expense.type === 'food' && expense.foodOrders && (
                        <div className="mt-3 p-3 bg-orange-50 rounded-lg border border-orange-200">
                          <p className="text-sm font-medium text-orange-800 mb-2">Individual Orders:</p>
                          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 text-sm">
                            {Object.entries(expense.foodOrders).map(([person, amount]) => (
                              <div key={person} className="flex justify-between">
                                <span className="text-gray-600">{person}:</span>
                                <span className="font-medium">${amount.toFixed(2)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2 ml-4">
                      <button
                        onClick={() => {
                          window.alert('Inline expense editing is not wired yet. You can delete and re-add the expense for now.');
                        }}
                        className="p-2 text-blue-600 hover:bg-blue-100 rounded-lg transition-all"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => deleteExpense(expense.id)}
                        className="p-2 text-red-600 hover:bg-red-100 rounded-lg transition-all"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            
            <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-lg font-semibold text-blue-800">Total Expenses: ${totalExpenses.toFixed(2)}</p>
                  <p className="text-sm text-blue-600">Regular expenses: ${totalRegularExpenses.toFixed(2)}</p>
                  <p className="text-sm text-blue-600">Food expenses: ${totalFoodExpenses.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-sm text-blue-600">Per person (regular only): ${perPersonRegularShare.toFixed(2)}</p>
                  <button
                    onClick={calculateSettlements}
                    className="mt-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all flex items-center gap-2 font-medium"
                  >
                    <Calculator className="w-4 h-4" />
                    Calculate Settlements
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Phase 3.3 Analytics Panel */}
        {(expenses.length > 0 || receiptHistory.length > 0) && (
          <div className="bg-white/70 backdrop-blur-sm rounded-2xl p-6 shadow-xl border border-white/20 mb-6">
            <h2 className="text-2xl font-semibold text-gray-800 mb-4">Phase 3.3 Analytics</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
              <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3">
                <p className="text-xs text-indigo-700">Saved Receipts</p>
                <p className="text-xl font-bold text-indigo-900">{savedReceiptCount}</p>
              </div>
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
                <p className="text-xs text-blue-700">Parsed Items (History)</p>
                <p className="text-xl font-bold text-blue-900">{savedParsedItemsCount}</p>
              </div>
              <div className="rounded-lg border border-green-200 bg-green-50 p-3">
                <p className="text-xs text-green-700">Parsed Amount Coverage</p>
                <p className="text-xl font-bold text-green-900">{receiptCoveragePercent.toFixed(1)}%</p>
              </div>
              <div className="rounded-lg border border-purple-200 bg-purple-50 p-3">
                <p className="text-xs text-purple-700">Tracked Expense Total</p>
                <p className="text-xl font-bold text-purple-900">${totalExpenses.toFixed(2)}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="rounded-lg border border-gray-200 bg-white p-4">
                <h3 className="text-sm font-semibold text-gray-800 mb-3">Model Confidence Snapshot</h3>
                <div className="space-y-2 text-sm text-gray-700">
                  <p>
                    Average OCR confidence:{' '}
                    <span className="font-semibold">{avgOcrConfidence !== null ? avgOcrConfidence.toFixed(3) : 'n/a'}</span>
                  </p>
                  <p>
                    Average parser confidence:{' '}
                    <span className="font-semibold">{avgParserConfidence !== null ? avgParserConfidence.toFixed(3) : 'n/a'}</span>
                  </p>
                  <p>
                    Parsed amount total (history):{' '}
                    <span className="font-semibold">${savedParsedAmountTotal.toFixed(2)}</span>
                  </p>
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 bg-white p-4">
                <h3 className="text-sm font-semibold text-gray-800 mb-3">Top Receipt Items</h3>
                {topReceiptItems.length === 0 ? (
                  <p className="text-sm text-gray-600">No parsed receipt history available yet.</p>
                ) : (
                  <div className="space-y-2">
                    {topReceiptItems.map((entry) => (
                      <div key={entry.name} className="flex items-center justify-between text-sm">
                        <span className="text-gray-700">{entry.name}</span>
                        <span className="font-semibold text-gray-900">
                          {entry.count}x · ${entry.amount.toFixed(2)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="mt-4 rounded-lg border border-orange-200 bg-orange-50 p-4">
              <h3 className="text-sm font-semibold text-orange-800 mb-2">Food Spend by Person</h3>
              {foodSpendByPerson.length === 0 ? (
                <p className="text-sm text-orange-700">No food-order expenses recorded yet.</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {foodSpendByPerson.map((entry) => (
                    <div key={entry.person} className="flex items-center justify-between rounded border border-orange-200 bg-white px-3 py-2 text-sm">
                      <span className="text-gray-700">{entry.person}</span>
                      <span className="font-semibold text-gray-900">${entry.amount.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Results Section */}
        {showResults && (
          <div className="bg-white/70 backdrop-blur-sm rounded-2xl p-6 shadow-xl border border-white/20">
            <h2 className="text-2xl font-semibold text-gray-800 mb-4">Settlement Results</h2>
            
            {settlements.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-green-600 text-lg font-medium">🎉 All expenses are already settled!</p>
                <p className="text-gray-600 mt-2">Everyone has paid their fair share.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {settlements.map((settlement, index) => (
                  <div key={index} className="flex items-center justify-between p-4 bg-gradient-to-r from-red-50 to-green-50 rounded-lg border border-gray-200">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                        <span className="text-red-600 font-bold">{settlement.from.charAt(0)}</span>
                      </div>
                      <div>
                        <p className="font-medium text-gray-800">
                          <span className="text-red-600">{settlement.from}</span> owes{' '}
                          <span className="text-green-600">{settlement.to}</span>
                        </p>
                        <p className="text-sm text-gray-600">Settlement amount</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold text-gray-800">${settlement.amount.toFixed(2)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
