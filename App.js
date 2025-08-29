import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, addDoc, onSnapshot, collection, query, serverTimestamp, deleteDoc } from 'firebase/firestore';

// Define the workout routine
const WORKOUT_ROUTINE = [
  { name: 'Band Squats', sets: 4, reps: 12, restBetweenReps: 30, restBetweenSets: 120 },
  { name: 'Band Rows', sets: 4, reps: 12, restBetweenReps: 30, restBetweenSets: 120 },
  { name: 'Band Push-ups', sets: 4, reps: 12, restBetweenReps: 30, restBetweenSets: 120 },
  { name: 'Band Bicep Curls', sets: 4, reps: 12, restBetweenReps: 30, restBetweenSets: 120 },
  { name: 'Band Pull-downs', sets: 4, reps: 12, restBetweenReps: 30, restBetweenSets: 120 },
];

const ROUTINE_NAME = "The Full-Body Assault";

const App = () => {
  // State for Firebase
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [userId, setUserId] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);

  // State for the workout
  const [isTraining, setIsTraining] = useState(false);
  const [currentExerciseIndex, setCurrentExerciseIndex] = useState(0);
  const [currentSet, setCurrentSet] = useState(1);
  const [currentRep, setCurrentRep] = useState(0);
  const [timer, setTimer] = useState(0);
  const [isResting, setIsResting] = useState(false);
  const [workoutComplete, setWorkoutComplete] = useState(false);
  const [statusMessage, setStatusMessage] = useState("Tap Start to begin your workout.");

  // State for TTS and voice recognition
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [manlyVoice, setManlyVoice] = useState(null);
  const recognitionRef = useRef(null);
  const audioContextRef = useRef(null);

  // State for workout history
  const [workoutHistory, setWorkoutHistory] = useState([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [isSavingWorkout, setIsSavingWorkout] = useState(false);

  const timerIntervalRef = useRef(null);
  const currentWorkout = WORKOUT_ROUTINE[currentExerciseIndex];

  // Function to generate a simple beep sound
  const playBeep = (frequency = 440, duration = 100) => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    const oscillator = audioContextRef.current.createOscillator();
    const gainNode = audioContextRef.current.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContextRef.current.destination);

    oscillator.type = 'sine';
    oscillator.frequency.value = frequency;

    gainNode.gain.setValueAtTime(0, audioContextRef.current.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.5, audioContextRef.current.currentTime + 0.01);
    oscillator.start(audioContextRef.current.currentTime);
    gainNode.gain.linearRampToValueAtTime(0, audioContextRef.current.currentTime + duration / 1000);
    oscillator.stop(audioContextRef.current.currentTime + duration / 1000);
  };

  // Function to handle Web Speech Synthesis
  const speakText = (text) => {
    if (isSpeaking) {
      console.log("Speech in progress, blocking new command:", text);
      return;
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel(); // Cancel any ongoing speech
      const utterance = new SpeechSynthesisUtterance(text);
      if (manlyVoice) {
        utterance.voice = manlyVoice;
      }
      utterance.pitch = 1.0;
      utterance.rate = 1.0;
      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = (event) => {
        console.error("Speech Synthesis Error:", event.error);
        setIsSpeaking(false);
      };
      window.speechSynthesis.speak(utterance);
    } else {
      console.warn("Web Speech Synthesis is not supported in this browser.");
      setStatusMessage("Voice not supported. Check browser compatibility.");
    }
  };
  
  // Function to save an individual exercise to Firestore
  const saveExercise = async (exerciseData) => {
    if (!db || !userId) {
      console.error("Firebase not initialized or user not authenticated.");
      return;
    }

    try {
      const exercisesCollection = collection(db, `artifacts/${__app_id}/users/${userId}/exercises`);
      await addDoc(exercisesCollection, {
        date: serverTimestamp(),
        ...exerciseData
      });
      console.log("Exercise saved successfully:", exerciseData.name);
    } catch (error) {
      console.error("Error saving exercise:", error);
    }
  };

  // Function to delete an exercise from Firestore
  const deleteExercise = async (id) => {
    if (!db || !userId) {
      console.error("Firebase not initialized or user not authenticated.");
      return;
    }

    try {
      const exerciseDocRef = doc(db, `artifacts/${__app_id}/users/${userId}/exercises`, id);
      await deleteDoc(exerciseDocRef);
      console.log("Exercise deleted successfully:", id);
    } catch (error) {
      console.error("Error deleting exercise:", error);
    }
  };

  // Firebase initialization and authentication
  useEffect(() => {
    if (db && auth) return;
    try {
      const firebaseConfig = JSON.parse(__firebase_config);
      const app = initializeApp(firebaseConfig);
      const firestoreDb = getFirestore(app);
      const firebaseAuth = getAuth(app);
      setDb(firestoreDb);
      setAuth(firebaseAuth);

      const handleAuthStateChange = (user) => {
        if (user) {
          setUserId(user.uid);
          setIsAuthReady(true);
        } else {
          setUserId(null);
          setIsAuthReady(true);
        }
      };

      const unsubscribe = onAuthStateChanged(firebaseAuth, handleAuthStateChange);
      
      const authUser = async () => {
        try {
          if (typeof __initial_auth_token !== 'undefined') {
            await signInWithCustomToken(firebaseAuth, __initial_auth_token);
          } else {
            await signInAnonymously(firebaseAuth);
          }
        } catch (error) {
          console.error("Firebase auth error:", error);
          setIsAuthReady(true);
        }
      };
      
      authUser();
      
      return () => unsubscribe();
      
    } catch (e) {
      console.error("Firebase initialization failed:", e);
      setIsAuthReady(true);
    }
  }, []);

  // Effect to fetch and listen for workout history data
  useEffect(() => {
    if (db && userId) {
      console.log("Fetching workout history for user:", userId);
      setIsLoadingHistory(true);
      // Change the query to the new 'exercises' collection
      const q = query(collection(db, `artifacts/${__app_id}/users/${userId}/exercises`));
      
      const unsubscribe = onSnapshot(q, (snapshot) => {
        console.log("Workout history update received:", snapshot.docs.length, "documents");
        const historyData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setWorkoutHistory(historyData);
        setIsLoadingHistory(false);
      }, (error) => {
        console.error("Failed to fetch workout history:", error);
        setIsLoadingHistory(false);
      });
      
      return () => unsubscribe();
    }
  }, [db, userId]);

  // Main workout timer and state machine logic
  useEffect(() => {
    // Timer logic
    if (isTraining && timer > 0) {
      timerIntervalRef.current = setInterval(() => {
        setTimer(prevTime => prevTime - 1);
      }, 1000);
    } else if (timer === 0 && isTraining) {
      // Timer has finished
      clearInterval(timerIntervalRef.current);
      if (isResting) {
        handleRestEnd();
      }
    }

    return () => clearInterval(timerIntervalRef.current);
  }, [isTraining, timer, isResting]);

  // Select a "manly" voice from the browser's list
  useEffect(() => {
    const setVoice = () => {
      const voices = window.speechSynthesis.getVoices();
      const maleVoice = voices.find(voice => 
        voice.name.includes('Google UK English Male') || 
        voice.name.includes('Google US English Male') ||
        voice.name.includes('Alex')
      );
      if (maleVoice) {
        setManlyVoice(maleVoice);
      } else {
        console.warn("Could not find a suitable male voice. Using default.");
      }
    };

    if ('speechSynthesis' in window) {
      setVoice();
      window.speechSynthesis.onvoiceschanged = setVoice;
    }
  }, []);

  // Add the voice countdown for the initial 10-second timer and rest periods
  useEffect(() => {
    // Initial workout countdown
    if (isTraining && !isResting && timer > 0 && timer <= 10 && currentExerciseIndex === 0 && currentSet === 1) {
      playBeep();
    }
    
    // Voice cue for rest periods
    if (isTraining && isResting) {
      if (timer === 10) {
        speakText("Ten seconds left. Get ready to go.");
      }
      // Beeps for the final seconds of rest
      if (timer >= 2 && timer <= 12) {
        playBeep(440, 100);
      } else if (timer === 1) {
        playBeep(440, 1000);
      }
    }
  }, [timer, isTraining, isResting, currentExerciseIndex, currentSet]);


  // Handle the end of a rest period
  const handleRestEnd = () => {
    setIsResting(false);
    if (currentSet < currentWorkout.sets) {
      const nextSetNumber = currentSet + 1;
      setStatusMessage(`Rest complete. Set ${nextSetNumber} of ${currentWorkout.sets}. Perform ${currentWorkout.reps} reps of ${currentWorkout.name}.`);
      speakText(`Rest complete. Starting set ${nextSetNumber}. Perform ${currentWorkout.reps} reps of ${currentWorkout.name}.`);
      // Start listening after a short delay to allow the voice to start playing
      setTimeout(() => {
          startListening();
      }, 2000); // 2 second delay

      setCurrentSet(nextSetNumber);
    } else {
      handleExerciseComplete();
    }
  };

  // Handle a single rep completion
  const handleRepComplete = () => {
    setCurrentRep(prevRep => {
      const newRep = prevRep + 1;
      if (newRep >= currentWorkout.reps) {
        // Set is complete
        setStatusMessage(`Great work! Set ${currentSet} is complete. Rest for 2 minutes.`);
        speakText(`Set ${currentSet} is complete. Take a 2 minute rest.`);
        setIsResting(true);
        setTimer(currentWorkout.restBetweenSets);
        setCurrentRep(0);
      } else {
        // Rep is complete, start a short rest
        setStatusMessage(`Rep ${newRep} done. Rest for 30 seconds.`);
        speakText(`Rest.`); // Simplified command to prevent interruptions
        setIsResting(true);
        setTimer(currentWorkout.restBetweenReps);
      }
      return newRep;
    });
  };

  // Handle completion of an entire exercise
  const handleExerciseComplete = () => {
    // Save the completed exercise to history
    saveExercise({
      name: currentWorkout.name,
      sets: currentWorkout.sets,
      reps: currentWorkout.reps,
      totalTime: 'N/A' // Placeholder, as we don't track this yet
    });

    if (currentExerciseIndex < WORKOUT_ROUTINE.length - 1) {
      const nextExercise = WORKOUT_ROUTINE[currentExerciseIndex + 1];
      setStatusMessage(`You've completed ${currentWorkout.name}. Take a 2-minute break before your next exercise, ${nextExercise.name}.`);
      speakText(`You've completed ${currentWorkout.name}. Take a two-minute break to recover before the next exercise: ${nextExercise.name}.`);
      setCurrentExerciseIndex(prevIndex => prevIndex + 1);
      setCurrentSet(1);
      setTimer(120); // 2 minutes rest between exercises
      setIsResting(true); // Treat as rest before next exercise
    } else {
      // All exercises complete
      setStatusMessage("Workout complete!");
      setWorkoutComplete(true);
      setIsTraining(false);
      speakText("Congratulations! Workout complete.");
    }
  };

  // Web Speech API for voice recognition
  const startListening = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn("Speech Recognition not supported in this browser.");
      return;
    }

    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    
    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = true; // Use interim results to keep listening
    recognition.continuous = true;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      const transcript = event.results[event.results.length - 1][0].transcript.trim().toLowerCase();
      console.log('Recognized:', transcript);
      if (transcript.includes('done') || transcript.includes('okay done')) {
        handleRepComplete();
      }
    };

    recognition.onend = () => {
      // Restart listening if the workout is active and not complete
      if (isTraining && !isResting && !workoutComplete) {
        recognition.start();
      } else {
        setIsListening(false);
      }
    };

    recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error);
      // Automatically restart listening if there's a "no-speech" error
      if (event.error === 'no-speech' && isTraining && !isResting) {
        console.log("No speech detected, restarting recognition.");
        // Add a small delay before restarting to prevent a rapid loop of errors.
        setTimeout(() => {
          if (isTraining && !isResting && !workoutComplete) {
            recognition.start();
          }
        }, 500); // 500ms delay
      } else {
        setIsListening(false);
      }
    };

    try {
      recognition.start();
      setIsListening(true);
      recognitionRef.current = recognition;
    } catch (error) {
      console.error("Failed to start speech recognition:", error);
      setIsListening(false);
    }
  };

  // Control handlers
  const handleStart = () => {
    setIsTraining(true);
    setWorkoutComplete(false);
    setStatusMessage("Starting workout in 10 seconds...");
    speakText("Workout starting. Get ready in 10 seconds.");
    setTimer(10); // Initial 10-second countdown
    
    // After the initial countdown, begin the first exercise
    setTimeout(() => {
      setStatusMessage(`Set 1 of ${currentWorkout.sets}. Perform ${currentWorkout.reps} reps of ${currentWorkout.name}.`);
      speakText(`Let's begin! First exercise is ${currentWorkout.name}.`);
      startListening();
    }, 10000);
  };

  const handlePause = () => {
    setIsTraining(false);
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    window.speechSynthesis.cancel();
    setStatusMessage("Workout paused.");
    speakText("Workout paused.");
  };

  const handleResume = () => {
    setIsTraining(true);
    setStatusMessage("Workout resumed.");
    speakText("Workout resumed. Let's get back to it.");
    startListening();
  };

  const handleReset = () => {
    clearInterval(timerIntervalRef.current);
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    window.speechSynthesis.cancel();
    setIsTraining(false);
    setIsResting(false);
    setWorkoutComplete(false);
    setCurrentExerciseIndex(0);
    setCurrentSet(1);
    setCurrentRep(0);
    setTimer(0);
    setStatusMessage("Workout reset. Ready when you are!");
    speakText("Workout reset. Ready when you are!");
  };

  if (!isAuthReady) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-900 text-gray-100">
        <div className="text-center">
          <svg className="animate-spin h-8 w-8 text-white mx-auto mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <p>Connecting to a secure channel...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 flex flex-col items-center justify-center p-4 font-inter">
      {/* Main workout display card */}
      <div className="bg-gray-800 p-8 rounded-2xl shadow-xl max-w-lg w-full flex flex-col items-center">
        <h1 className="text-3xl font-bold mb-2 text-blue-400">AI Workout Assistant</h1>
        <p className="text-sm text-gray-400 mb-6">{ROUTINE_NAME}</p>
        
        {workoutComplete ? (
          <div className="text-center my-8">
            <svg className="w-16 h-16 mx-auto text-green-500 mb-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"></path>
            </svg>
            <p className="text-2xl font-semibold text-green-400">Workout Complete!</p>
            {isSavingWorkout ? (
              <p className="text-gray-400 mt-2">Saving your progress...</p>
            ) : (
              <p className="text-gray-400 mt-2">Your progress has been saved.</p>
            )}
          </div>
        ) : (
          <>
            <div className="text-center w-full my-4">
              <span className="text-xs text-gray-400 tracking-wide uppercase">
                {`Exercise ${currentExerciseIndex + 1} of ${WORKOUT_ROUTINE.length}`}
              </span>
              <h2 className="text-4xl md:text-5xl font-extrabold text-blue-300 mt-1 mb-2 leading-tight">
                {currentWorkout.name}
              </h2>
              <div className="flex flex-col items-center justify-center text-center">
                <p className="text-2xl text-gray-400 font-semibold mt-4">Set {currentSet} of {currentWorkout.sets}</p>
                <p className="text-xl text-gray-400 font-semibold">Reps: {currentRep} of {currentWorkout.reps}</p>
              </div>

              {isResting && (
                <div className="mt-4">
                  <p className="text-md text-gray-400 font-semibold">Resting...</p>
                  <p className="text-6xl md:text-8xl font-bold my-2 text-white">
                    {timer}
                    <span className="text-2xl md:text-3xl font-normal text-gray-400 ml-1">s</span>
                  </p>
                </div>
              )}
            </div>
            <p className="text-lg text-white font-medium my-4">{statusMessage}</p>
          </>
        )}
        
        {/* Control buttons */}
        <div className="flex space-x-4 mt-6">
          {!isTraining && !workoutComplete && (
            <button
              onClick={handleStart}
              className="px-6 py-3 bg-blue-600 text-white font-semibold rounded-full shadow-lg hover:bg-blue-700 transition duration-300 ease-in-out transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50"
            >
              Start
            </button>
          )}
          {isTraining && (
            <button
              onClick={handlePause}
              className="px-6 py-3 bg-yellow-500 text-gray-900 font-semibold rounded-full shadow-lg hover:bg-yellow-600 transition duration-300 ease-in-out transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:ring-opacity-50"
            >
              Pause
            </button>
          )}
          {!isTraining && !workoutComplete && (currentExerciseIndex > 0) && (
            <button
              onClick={handleResume}
              className="px-6 py-3 bg-green-500 text-white font-semibold rounded-full shadow-lg hover:bg-green-600 transition duration-300 ease-in-out transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-green-400 focus:ring-opacity-50"
            >
              Resume
            </button>
          )}
          {(isTraining || workoutComplete) && (
            <button
              onClick={handleReset}
              className="px-6 py-3 bg-red-600 text-white font-semibold rounded-full shadow-lg hover:bg-red-700 transition duration-300 ease-in-out transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-opacity-50"
            >
              Reset
            </button>
          )}
          {isTraining && !isResting && (
            <button
              onClick={handleRepComplete}
              className="px-6 py-3 bg-purple-600 text-white font-semibold rounded-full shadow-lg hover:bg-purple-700 transition duration-300 ease-in-out transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-opacity-50"
            >
              Done Rep
            </button>
          )}
        </div>
        {isListening && <p className="mt-4 text-green-400">Listening...</p>}
      </div>
      
      {/* Workout History section */}
      <div className="bg-gray-800 p-6 mt-8 rounded-2xl shadow-xl max-w-lg w-full">
        <h2 className="text-xl font-bold mb-4 text-blue-400">Workout History</h2>
        {isLoadingHistory ? (
          <p className="text-gray-400 text-center">Loading history...</p>
        ) : workoutHistory.length > 0 ? (
          <ul className="space-y-4">
            {workoutHistory.map(session => (
              <li key={session.id} className="bg-gray-700 p-4 rounded-xl flex justify-between items-center transition duration-200 hover:bg-gray-600">
                <div>
                  <p className="text-md font-semibold text-gray-200">
                    {session.name}
                  </p>
                  <p className="text-sm text-gray-400">
                    Completed {session.sets} sets of {session.reps} reps on {new Date(session.date?.toDate()).toLocaleString()}
                  </p>
                </div>
                <button
                  onClick={() => deleteExercise(session.id)}
                  className="p-2 text-red-400 hover:text-red-500 transition-colors duration-200"
                  aria-label="Delete exercise"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm6 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clipRule="evenodd" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-gray-400 text-center">No workouts recorded yet. Start a session to save your progress!</p>
        )}
      </div>

      {/* Display User ID for debugging/sharing */}
      {userId && (
        <div className="bg-gray-800 p-4 mt-8 rounded-xl shadow-inner max-w-lg w-full text-center">
          <p className="text-sm font-mono text-gray-400 truncate">
            User ID: {userId}
          </p>
        </div>
      )}
    </div>
  );
};

export default App;
