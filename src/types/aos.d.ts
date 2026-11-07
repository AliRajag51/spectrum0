/* `aos` ships no type declarations; this covers the two calls the hero and
   feature sections make. */
declare module "aos" {
  type AosOptions = {
    duration?: number;
    easing?: string;
    once?: boolean;
    offset?: number;
    delay?: number;
    disable?: boolean | string | (() => boolean);
  };
  const AOS: {
    init: (options?: AosOptions) => void;
    refresh: (initialize?: boolean) => void;
    refreshHard: () => void;
  };
  export default AOS;
}
