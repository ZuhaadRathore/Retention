import { useEffect } from "react";

import { DeckDetails } from "./components/DeckDetails";
import { DeckList } from "./components/DeckList";
import { useDeckStore } from "./store/deckStore";
import { useBackendStore } from "./store/backendStore";

function App() {
  const initializeDecks = useDeckStore((state) => state.initialize);
  const checkHealth = useBackendStore((state) => state.checkHealth);

  useEffect(() => {
    void initializeDecks();
  }, [initializeDecks]);

  useEffect(() => {
    void checkHealth();

    // Poll backend health every 30 seconds
    const interval = setInterval(() => {
      void checkHealth();
    }, 30000);

    return () => clearInterval(interval);
  }, [checkHealth]);

  return (
    <div className="relative flex min-h-screen bg-background-light paper-texture">
      <aside className="w-72 bg-card-background/60 p-6 flex flex-col justify-between border-r-4 border-border-color shadow-lg">
        <div>
          <div className="flex flex-col mb-10 p-3">
            <h1 className="text-primary text-5xl font-bold leading-tight font-display tracking-tight">Retention</h1>
            <p className="text-text-muted text-base font-medium mt-2">Learn it. Keep it. Make it stick.</p>
          </div>
          <div>
            <DeckList />
          </div>
        </div>
      </aside>
      <main className="flex-1 flex flex-col p-10 bg-gradient-to-br from-background-light via-background-light to-paper-line">
        <DeckDetails />
      </main>
    </div>
  );
}

export default App;
