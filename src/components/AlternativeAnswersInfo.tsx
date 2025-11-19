import { LightBulbIcon } from "./icons";

interface AlternativeAnswersInfoProps {
  onClose: () => void;
}

export function AlternativeAnswersInfo({ onClose }: AlternativeAnswersInfoProps) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-card-background rounded-2xl border-3 border-border-color shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto hand-drawn-card">
        <div className="p-8">
          <div className="flex items-start justify-between mb-6">
            <h2 className="text-3xl font-bold text-primary m-0">
              Alternative Answers
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="text-text-muted hover:text-text-color text-3xl leading-none transition-colors"
              aria-label="Close"
            >
              ×
            </button>
          </div>

          <div className="space-y-6">
            <div>
              <h3 className="text-xl font-semibold text-text-color mb-2">
                What are Alternative Answers?
              </h3>
              <p className="text-text-muted leading-relaxed">
                Sometimes you might answer a question correctly, but phrase it differently than the expected answer.
                Alternative answers let you save your own correct phrasings so they're automatically accepted in future reviews.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-primary/5 border-2 border-primary/20">
              <h4 className="text-lg font-semibold text-text-color mb-2">
                How It Works
              </h4>
              <ol className="space-y-3 text-text-muted ml-4">
                <li className="leading-relaxed">
                  <strong className="text-text-color">1. Answer a card:</strong> When you get an "almost", "missing keypoints", or "incorrect" verdict, you'll see the "Accept My Answer" button.
                </li>
                <li className="leading-relaxed">
                  <strong className="text-text-color">2. Accept your answer:</strong> If you believe your answer should be accepted, click "Accept My Answer" to add it as an alternative.
                </li>
                <li className="leading-relaxed">
                  <strong className="text-text-color">3. Future reviews:</strong> Your accepted alternative will be automatically recognized as correct in all future study sessions.
                </li>
              </ol>
            </div>

            <div className="p-4 rounded-xl bg-correct-green/10 border-2 border-correct-green/30">
              <h4 className="text-lg font-semibold text-text-color mb-2">
                Example
              </h4>
              <div className="space-y-2 text-sm">
                <p className="m-0">
                  <strong className="text-text-color">Question:</strong> What is the capital of France?
                </p>
                <p className="m-0">
                  <strong className="text-text-color">Expected answer:</strong> Paris
                </p>
                <p className="m-0">
                  <strong className="text-text-color">Your answer:</strong> "Paris, France" or "The city of Paris"
                </p>
                <p className="m-0 text-text-muted">
                  → Click "Accept My Answer" to add your phrasing as an alternative!
                </p>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-orange-50 border-2 border-orange-200">
              <div className="flex items-center gap-2 mb-2">
                <LightBulbIcon size={20} className="text-orange-800 flex-shrink-0" />
                <h4 className="text-lg font-semibold text-orange-800 m-0">
                  Pro Tip
                </h4>
              </div>
              <p className="text-orange-700 text-sm leading-relaxed m-0">
                Use alternative answers to customize your flashcards to match your learning style.
                Over time, your deck becomes personalized to how you naturally express knowledge!
              </p>
            </div>

            <div className="flex justify-end mt-6">
              <button
                type="button"
                onClick={onClose}
                className="px-8 py-3 rounded-full bg-primary text-white font-bold hand-drawn-btn hover:bg-primary/90 text-base"
              >
                Got it!
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
