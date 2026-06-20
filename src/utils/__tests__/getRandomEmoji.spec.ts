import { getRandomEmoji, getCuteEmoji, getRandomPetName } from '../getRandomEmoji';

const EROTIC = ["🔥", "💋", "👅", "🍆", "🔥", "💋", " 🙈", "👅", "🍑", "🍆", "💦", "🍑", "😚", "😏", "💦", "🥕", "🥖"];
const CUTE = ["🌸", "💖", "💅", "✨", "💐", "🎀", "🌷", "🦋", "💞", "💫", "🌈", "🍓", "🧁", "🌺", "🥰", "😊", "💕", "🌻"];
const PET = ["Cuti", 'Cutie', "Sweety", "Shinny", 'Shiney', "Bubli", "Cuddly", "Sparkle", "Hunny", "Twinkle", "Bunni", "Cuppy", "Jelly", "Rosy", "Starry", "Dolly", "Pinku", "Glitzy", "Chirpy", "Mishu", "Dreamy", "Lovely", "Puppy", "Kuttie", "Rinkly", "Bouncy"];

describe('getRandomEmoji helpers', () => {
  afterEach(() => jest.restoreAllMocks());

  test('getRandomEmoji always returns a member of the erotic emoji list', () => {
    for (let i = 0; i < 100; i++) {
      expect(EROTIC).toContain(getRandomEmoji());
    }
  });

  test('getRandomEmoji returns the first element when random is 0', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0);
    expect(getRandomEmoji()).toBe(EROTIC[0]);
  });

  test('getRandomEmoji returns the last element when random is near 1', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.999999);
    expect(getRandomEmoji()).toBe(EROTIC[EROTIC.length - 1]);
  });

  test('getCuteEmoji always returns a member of the cute emoji list', () => {
    for (let i = 0; i < 100; i++) {
      expect(CUTE).toContain(getCuteEmoji());
    }
  });

  test('getCuteEmoji honors a mocked random index', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0);
    expect(getCuteEmoji()).toBe(CUTE[0]);
  });

  test('getRandomPetName always returns a member of the pet name list', () => {
    for (let i = 0; i < 100; i++) {
      expect(PET).toContain(getRandomPetName());
    }
  });

  test('getRandomPetName honors a mocked random index', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.999999);
    expect(getRandomPetName()).toBe(PET[PET.length - 1]);
  });
});
