export const isVideoPlayerPage = (url: string) => {
  return /\/video\/[^/?]+/.test(url) && url.includes("video=visa");
};
