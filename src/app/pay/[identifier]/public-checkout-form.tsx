type PollContext = Readonly<{ signal: AbortSignal; isCurrent: () => boolean; schedule: (delay: number) => void }>;
type VisibilityDocument = Pick<Document, "visibilityState"> & Readonly<{
  addEventListener: (type: "visibilitychange", listener: () => void) => void;
  removeEventListener: (type: "visibilitychange", listener: () => void) => void;
}>;

// Frozen export (14.6.1 F03 contract): `src/app/store/[slug]/pay/standalone-payment-experience.tsx`
// and `./checkout-experience.tsx` import this from this exact path, name and
// signature — never move, rename or reshape it. The V1 `PublicCheckoutForm`
// adapter that used to live in this file was retired by 15.3.1 (unreachable,
// no route imported it); this file now hosts only the shared polling primitive.
export function createPollingController(document: VisibilityDocument, poll: (context: PollContext) => Promise<void>) {
  let stopped = false;
  let polling = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let controller: AbortController | undefined;
  let activePoll = 0;

  const clearTimer = () => {
    if (timer) clearTimeout(timer);
    timer = undefined;
  };
  const isVisible = () => document.visibilityState !== "hidden";
  const pause = () => {
    activePoll += 1;
    clearTimer();
    controller?.abort();
    controller = undefined;
    polling = false;
  };
  const schedule = (delay: number) => {
    if (stopped || !isVisible()) return;
    clearTimer();
    timer = setTimeout(() => {
      timer = undefined;
      void run();
    }, delay);
  };
  const run = async () => {
    if (stopped || polling || !isVisible()) return;
    polling = true;
    const requestController = new AbortController();
    controller = requestController;
    const pollId = ++activePoll;
    const isCurrent = () => !stopped && isVisible() && pollId === activePoll;
    try {
      await poll({ signal: requestController.signal, isCurrent, schedule: (delay) => { if (isCurrent()) schedule(delay); } });
    } finally {
      if (pollId === activePoll) polling = false;
    }
  };
  const onVisibilityChange = () => {
    if (!isVisible()) { pause(); return; }
    schedule(0);
  };

  return {
    start: () => { document.addEventListener("visibilitychange", onVisibilityChange); schedule(0); },
    stop: () => { stopped = true; pause(); document.removeEventListener("visibilitychange", onVisibilityChange); },
  };
}
