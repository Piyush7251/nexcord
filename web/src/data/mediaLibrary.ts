export interface EmojiCategory {
  id: string;
  name: string;
  icon: string;
  emojis: string[];
}

export interface GifItem {
  id: string;
  title: string;
  category: 'hype' | 'gaming' | 'memes' | 'reactions' | 'anime';
  url: string;
  previewUrl: string;
}

export interface StickerItem {
  id: string;
  name: string;
  pack: 'gaming' | 'squad' | 'badges';
  url: string;
}

export const EMOJI_CATEGORIES: EmojiCategory[] = [
  {
    id: 'smileys',
    name: 'Smileys & Emotion',
    icon: '😀',
    emojis: [
      '😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '🥲', '🥹',
      '😊', '😇', '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😋',
      '😛', '😜', '🤪', '😎', '🤩', '🥳', '😏', '😒', '😞', '😔',
      '😟', '😕', '🥺', '😢', '😭', '😤', '😠', '😡', '🤬', '🤯',
      '😳', '🥵', '🥶', '😱', '😨', '😰', '🤗', '🤔', '🫣', '🤭',
      '🤫', '🫡', '🤥', '😶', '😐', '😑', '😬', '😮‍💨', '😴', '🤤',
      '😵', '😵‍💫', '🤐', '🥴', '🤢', '🤮', '🤧', '😷', '🤒', '🤕',
      '🤑', '🤠', '😈', '👿', '👹', '👺', '🤡', '💩', '👻', '💀',
      '☠️', '👽', '👾', '🤖', '🎃'
    ],
  },
  {
    id: 'gestures',
    name: 'Gestures & People',
    icon: '👋',
    emojis: [
      '👍', '👎', '👊', '✊', '🤛', '🤜', '👏', '🙌', '👐', '🤲',
      '🤝', '🙏', '✍️', '💅', '🤳', '💪', '🦾', '👂', '👃', '🧠',
      '👀', '👁️', '👅', '👄', '💋', '🖐️', '✋', '🖖', '👋', '🤙',
      '🤌', '🤏', '✌️', '🤞', '🫰', '🤟', '🤘', '👈', '👉', '👆',
      '👇', '☝️', '🙋', '💁', '🙆', '🙅', '🤷', '🤦'
    ],
  },
  {
    id: 'gaming',
    name: 'Gaming & Squad',
    icon: '🎮',
    emojis: [
      '🎮', '🕹️', '🎯', '🎲', '🏆', '🥇', '🥈', '🥉', '🏅', '🎖️',
      '⚔️', '🛡️', '🏹', '💣', '🧨', '🔫', '👾', '👑', '💎', '🔮',
      '🚀', '🛸', '⚡', '🔥', '💥', '💫', '✨', '🌟', '🦾', '🤖',
      '🎧', '🎤', '🎙️', '🔊', '📢', '📣', '🚨', '🏁', '🚩', '🥊',
      '🛹', '🏎️', '🎪', '🎭', '🍿', '🎬', '📺'
    ],
  },
  {
    id: 'hearts',
    name: 'Hearts & Symbols',
    icon: '❤️',
    emojis: [
      '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔',
      '❤️‍🔥', '❤️‍🩹', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝',
      '💯', '💢', '💥', '💫', '💬', '💭', '🗯️', '♠️', '♣️', '♥️',
      '♦️', '🃏', '⭐', '🌟', '✨', '⚡', '☄️', '☀️', '🌙', '🔥'
    ],
  },
  {
    id: 'animals',
    name: 'Animals & Memes',
    icon: '🐶',
    emojis: [
      '🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐻‍❄️', '🐨',
      '🐯', '🦁', '🐮', '🐷', '🐸', '🐵', '🙈', '🙉', '🙊', '🐒',
      '🐔', '🐧', '🐦', '🐤', '🦆', '🦅', '🦉', '🦇', '🐺', '🐗',
      '🐴', '🦄', '🐝', '🐛', '🦋', '🐞', '🦀', '🦞', '🦐', '🐙',
      '🐬', '🐳', '🦈', '🐊', '🐅', '🐆', '🦓', '🦍', '🐘', '🦏',
      '🐪', '🦒', '🐕', '🐩', '🐈', '🐈‍⬛', '🐇', '🐲', '🐉', '🦖'
    ],
  },
  {
    id: 'food',
    name: 'Food & Drinks',
    icon: '🍕',
    emojis: [
      '🍕', '🍔', '🍟', '🌭', '🍿', '🥓', '🍳', '🧇', '🥞', '🧈',
      '🍞', '🥐', '🥨', '🧀', '🥗', '🥪', '🌮', '🌯', '🍜', '🍝',
      '🍣', '🍱', '🍛', '🍙', '🥟', '🍡', '🍧', '🍨', '🍦', '🍰',
      '🎂', '🍩', '🍪', '🍫', '🍬', '🍭', '☕', '🍵', '🧃', '🥤',
      '🧋', '🍺', '🍻', '🥂', '🍷', '🥃', '🍸', '🍹', '🧊'
    ],
  },
];

export const GIF_ITEMS: GifItem[] = [
  // Hype & Victory
  {
    id: 'lets_go',
    title: "Let's Go!",
    category: 'hype',
    url: 'https://media.giphy.com/media/26AHONQ79FdWZhAI0/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/26AHONQ79FdWZhAI0/giphy.gif',
  },
  {
    id: 'victory_confetti',
    title: 'Victory Royale',
    category: 'hype',
    url: 'https://media.giphy.com/media/l0MYt5jPR6QX5pnqM/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/l0MYt5jPR6QX5pnqM/giphy.gif',
  },
  {
    id: 'fire_hype',
    title: 'Hype Fire',
    category: 'hype',
    url: 'https://media.giphy.com/media/3o72FfM5HJydzafgUE/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/3o72FfM5HJydzafgUE/giphy.gif',
  },
  {
    id: 'dance_party',
    title: 'Dance Celebration',
    category: 'hype',
    url: 'https://media.giphy.com/media/3o7TKSjRrfIPjeiVyM/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/3o7TKSjRrfIPjeiVyM/giphy.gif',
  },
  {
    id: 'pepe_hype',
    title: 'Pepe Hype',
    category: 'hype',
    url: 'https://media.giphy.com/media/eJ4j2VnYOZU8qJU3Py/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/eJ4j2VnYOZU8qJU3Py/giphy.gif',
  },

  // Gaming & Clutch
  {
    id: 'gg_wp',
    title: 'GG WP (Well Played)',
    category: 'gaming',
    url: 'https://media.giphy.com/media/nbvFVPiEiJH6JOGIok/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/nbvFVPiEiJH6JOGIok/giphy.gif',
  },
  {
    id: 'gg_thumbsup',
    title: 'Good Game Thumbs Up',
    category: 'gaming',
    url: 'https://media.giphy.com/media/111ebonMs90YLu/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/111ebonMs90YLu/giphy.gif',
  },
  {
    id: 'rage_quit',
    title: 'Rage Quit Keyboard',
    category: 'gaming',
    url: 'https://media.giphy.com/media/11tTNkNy1SdXGg/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/11tTNkNy1SdXGg/giphy.gif',
  },

  // Memes & Fun
  {
    id: 'cat_vibing',
    title: 'Cat Vibing Jam',
    category: 'memes',
    url: 'https://media.giphy.com/media/artj92V8o75VPL7AeQ/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/artj92V8o75VPL7AeQ/giphy.gif',
  },
  {
    id: 'mind_blown',
    title: 'Mind Blown',
    category: 'memes',
    url: 'https://media.giphy.com/media/xT0xezQGU5xCDJuCPe/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/xT0xezQGU5xCDJuCPe/giphy.gif',
  },
  {
    id: 'popcorn_eating',
    title: 'Eating Popcorn',
    category: 'memes',
    url: 'https://media.giphy.com/media/l0HlHFRbmaZtBRhXG/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/l0HlHFRbmaZtBRhXG/giphy.gif',
  },
  {
    id: 'sus_rock',
    title: 'Sus Eyebrow Raise',
    category: 'memes',
    url: 'https://media.giphy.com/media/JaNtIG4UnKzD2/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/JaNtIG4UnKzD2/giphy.gif',
  },
  {
    id: 'rickroll_dance',
    title: 'Never Gonna Give You Up',
    category: 'memes',
    url: 'https://media.giphy.com/media/3oKIPnAiaMCws8nOsE/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/3oKIPnAiaMCws8nOsE/giphy.gif',
  },

  // Reactions
  {
    id: 'leonardo_cheers',
    title: 'Leonardo Cheers',
    category: 'reactions',
    url: 'https://media.giphy.com/media/g9582DNuQppxC/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/g9582DNuQppxC/giphy.gif',
  },
  {
    id: 'nodding_yes',
    title: 'Nodding Yes Agree',
    category: 'reactions',
    url: 'https://media.giphy.com/media/NEvPzZ8bdvV4Y/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/NEvPzZ8bdvV4Y/giphy.gif',
  },
  {
    id: 'high_five',
    title: 'High Five',
    category: 'reactions',
    url: 'https://media.giphy.com/media/3o85xkQpyMlnBkpB9C/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/3o85xkQpyMlnBkpB9C/giphy.gif',
  },
  {
    id: 'clapping_applause',
    title: 'Clapping Ovation',
    category: 'reactions',
    url: 'https://media.giphy.com/media/l4pTfx2qLszoacZRS/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/l4pTfx2qLszoacZRS/giphy.gif',
  },
  {
    id: 'facepalm',
    title: 'Facepalm Sigh',
    category: 'reactions',
    url: 'https://media.giphy.com/media/3oEjI67Egb8G9jqs3m/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/3oEjI67Egb8G9jqs3m/giphy.gif',
  },
  {
    id: 'blinking_guy',
    title: 'Blinking White Guy',
    category: 'reactions',
    url: 'https://media.giphy.com/media/3ELtfmA4Apkju/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/3ELtfmA4Apkju/giphy.gif',
  },
  {
    id: 'crying_cat',
    title: 'Crying Tear Cat',
    category: 'reactions',
    url: 'https://media.giphy.com/media/dzaUX7CAG0Ihi/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/dzaUX7CAG0Ihi/giphy.gif',
  },

  // Anime
  {
    id: 'anime_power',
    title: 'Anime Super Saiyan Power Up',
    category: 'anime',
    url: 'https://media.giphy.com/media/ul1omlrGG6kpO/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/ul1omlrGG6kpO/giphy.gif',
  },
];

export const STICKER_ITEMS: StickerItem[] = [
  // Gamer Badges Pack
  {
    id: 'badge_controller',
    name: 'Pro Gamer Controller',
    pack: 'badges',
    url: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f3ae.png',
  },
  {
    id: 'badge_trophy',
    name: 'Champion Trophy',
    pack: 'badges',
    url: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f3c6.png',
  },
  {
    id: 'badge_crown',
    name: 'Squad MVP Crown',
    pack: 'badges',
    url: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f451.png',
  },
  {
    id: 'badge_target',
    name: 'Headshot Bullseye',
    pack: 'badges',
    url: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f3af.png',
  },
  {
    id: 'badge_swords',
    name: 'Battle Crossed Swords',
    pack: 'badges',
    url: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/2694.png',
  },
  {
    id: 'badge_bomb',
    name: 'Bomb Defused Spike',
    pack: 'badges',
    url: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f4a3.png',
  },
  {
    id: 'badge_skull',
    name: 'Team Wipe Ace',
    pack: 'badges',
    url: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f480.png',
  },
  {
    id: 'badge_fire',
    name: 'On Fire Streak',
    pack: 'badges',
    url: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f525.png',
  },
  {
    id: 'badge_lightning',
    name: 'Clutch Master',
    pack: 'badges',
    url: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/26a1.png',
  },
  {
    id: 'badge_rocket',
    name: 'To The Moon Rocket',
    pack: 'badges',
    url: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f680.png',
  },
  {
    id: 'badge_gem',
    name: 'Diamond Tier',
    pack: 'badges',
    url: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f48e.png',
  },
  {
    id: 'badge_100',
    name: '100% Perfection',
    pack: 'badges',
    url: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f4af.png',
  },

  // Squad Mascot & Cute Pack
  {
    id: 'pika_hype',
    name: 'Pikachu Squad Hype',
    pack: 'squad',
    url: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/25.png',
  },
  {
    id: 'char_fire',
    name: 'Charizard Blazing',
    pack: 'squad',
    url: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/6.png',
  },
  {
    id: 'gengar_smirk',
    name: 'Gengar Phantom',
    pack: 'squad',
    url: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/94.png',
  },
  {
    id: 'eevee_cute',
    name: 'Eevee Greetings',
    pack: 'squad',
    url: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/133.png',
  },
  {
    id: 'snorlax_afk',
    name: 'Snorlax AFK Rest',
    pack: 'squad',
    url: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/143.png',
  },
  {
    id: 'mewtwo_iq',
    name: 'Mewtwo 1000 IQ',
    pack: 'squad',
    url: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/150.png',
  },
  {
    id: 'lucario_aura',
    name: 'Lucario Aura Focus',
    pack: 'squad',
    url: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/448.png',
  },
  {
    id: 'greninja_ninja',
    name: 'Greninja Stealth',
    pack: 'squad',
    url: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/658.png',
  },
];
