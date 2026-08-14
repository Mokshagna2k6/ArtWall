"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

import { duration, ease } from "@/lib/motion";

/**
 * "This wall is for you", said in turn in the languages of the people it is
 * for.
 *
 * The line is the whole argument of the page in six words, and saying it only
 * in English would quietly contradict it. India's artists do not share one
 * language, and a platform claiming to be built for seven million artisans
 * should not open by assuming they read the one we happen to write in.
 *
 * `lang` on each phrase is not decoration: it tells the browser which script
 * shaping and hyphenation rules to apply, and tells a screen reader which
 * voice to use. Without it, a screen reader attempts Bengali with English
 * phonetics, which is worse than not offering it at all.
 *
 * Accessibility: the rotation is `aria-hidden` and a single static English
 * line is exposed instead. A live region that replaced itself every two
 * seconds would hijack the screen reader continuously and make the page
 * unusable, which is the standard failure of carousels like this.
 *
 * Motion: under `prefers-reduced-motion` the cycle does not start at all. It
 * holds on English rather than freezing on whichever language happened to be
 * showing, so the reduced-motion experience is deliberate rather than a
 * snapshot of an interrupted animation.
 */

interface Phrase {
  /** BCP-47 tag, used for both shaping and screen-reader voice selection. */
  lang: string;
  /** The language's name, written in its own script. */
  name: string;
  text: string;
}

/**
 * Translations are the literal sense of "this wall is for you" rather than a
 * word-for-word mapping, since a word-for-word one reads as machine output in
 * most of these. Worth having a native speaker read them before launch.
 */
const PHRASES: readonly Phrase[] = [
  { lang: "en", name: "English", text: "This wall is for you" },
  { lang: "hi", name: "हिन्दी", text: "यह दीवार आपके लिए है" },
  { lang: "bn", name: "বাংলা", text: "এই দেয়াল আপনার জন্য" },
  { lang: "mr", name: "मराठी", text: "ही भिंत तुमच्यासाठी आहे" },
  { lang: "ta", name: "தமிழ்", text: "இந்தச் சுவர் உங்களுக்காக" },
  { lang: "te", name: "తెలుగు", text: "ఈ గోడ మీ కోసం" },
  { lang: "gu", name: "ગુજરાતી", text: "આ દીવાલ તમારા માટે છે" },
  { lang: "kn", name: "ಕನ್ನಡ", text: "ಈ ಗೋಡೆ ನಿಮಗಾಗಿ" },
  { lang: "ml", name: "മലയാളം", text: "ഈ ചുവര് നിങ്ങൾക്കുള്ളതാണ്" },
  { lang: "pa", name: "ਪੰਜਾਬੀ", text: "ਇਹ ਕੰਧ ਤੁਹਾਡੇ ਲਈ ਹੈ" },
  { lang: "or", name: "ଓଡ଼ିଆ", text: "ଏହି କାନ୍ଥ ଆପଣଙ୍କ ପାଇଁ" },
  { lang: "as", name: "অসমীয়া", text: "এই দেৱাল আপোনাৰ বাবে" },
  { lang: "ur", name: "اردو", text: "یہ دیوار آپ کے لیے ہے" },
];

/** Long enough to read a script you do not know, short enough to feel alive. */
const HOLD_MS = 2400;

export function MultilingualWelcome() {
  const [index, setIndex] = useState(0);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced) return;
    const id = setInterval(
      () => setIndex((i) => (i + 1) % PHRASES.length),
      HOLD_MS
    );
    return () => clearInterval(id);
  }, [reduced]);

  // Always renders index 0 on the server and on the first client paint, so
  // there is nothing for hydration to disagree about.
  const phrase = PHRASES[index];

  return (
    <div className="mt-10">
      {/* The one thing assistive tech reads. */}
      <p className="sr-only">This wall is for you.</p>

      <div aria-hidden className="flex flex-col items-center">
        {/* Fixed height so the surrounding layout never shifts as scripts of
            different heights swap through. */}
        <div className="relative flex h-14 w-full items-center justify-center sm:h-16">
          <AnimatePresence mode="wait" initial={false}>
            <motion.p
              key={phrase.lang}
              lang={phrase.lang}
              dir={phrase.lang === "ur" ? "rtl" : "ltr"}
              initial={reduced ? false : { opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduced ? undefined : { opacity: 0, y: -14 }}
              transition={{ duration: duration.moderate, ease: ease.standard }}
              className="font-heading text-section absolute text-balance"
            >
              {phrase.text}
            </motion.p>
          </AnimatePresence>
        </div>

        {/* The language's own name, kept quiet so it labels without competing. */}
        <div className="relative mt-3 flex h-5 items-center justify-center">
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={`${phrase.lang}-name`}
              lang={phrase.lang}
              initial={reduced ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={reduced ? undefined : { opacity: 0 }}
              transition={{ duration: duration.fast, ease: ease.standard }}
              className="text-muted-foreground text-eyebrow absolute"
            >
              {phrase.name}
            </motion.span>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
