import type { InstagramMediaRecord, InstagramProfile } from "./types";

export const professionalProfileFixture: InstagramProfile = {
  id: "17841400000000000",
  username: "gavilan_fixture",
  name: "Gavilán Fixture",
  accountType: "BUSINESS",
  profilePictureUrl: "https://example.test/profile.jpg",
  mediaCount: 2,
};

export const mediaFixtures: InstagramMediaRecord[] = [
  {
    id: "18000000000000001",
    mediaType: "VIDEO",
    mediaProductType: "REELS",
    caption: "Una escapada real",
    permalink: "https://www.instagram.com/reel/fixture-one/",
    thumbnailUrl: "https://example.test/reel.jpg",
    timestamp: "2026-08-30T14:00:00+0000",
    likeCount: 12,
    commentsCount: 3,
  },
  {
    id: "18000000000000002",
    mediaType: "IMAGE",
    mediaProductType: "FEED",
    caption: "Post real",
    permalink: "https://www.instagram.com/p/fixture-two/",
    mediaUrl: "https://example.test/post.jpg",
    timestamp: "2026-08-29T14:00:00+0000",
  },
];

