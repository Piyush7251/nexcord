class EmojiCategoryData {
  final String id;
  final String name;
  final String icon;
  final List<String> emojis;

  const EmojiCategoryData({
    required this.id,
    required this.name,
    required this.icon,
    required this.emojis,
  });
}

class GifItemData {
  final String id;
  final String title;
  final String category;
  final String url;

  const GifItemData({
    required this.id,
    required this.title,
    required this.category,
    required this.url,
  });
}

class StickerItemData {
  final String id;
  final String name;
  final String pack;
  final String url;

  const StickerItemData({
    required this.id,
    required this.name,
    required this.pack,
    required this.url,
  });
}

const kEmojiCategories = <EmojiCategoryData>[
  EmojiCategoryData(
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
  ),
  EmojiCategoryData(
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
  ),
  EmojiCategoryData(
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
  ),
  EmojiCategoryData(
    id: 'hearts',
    name: 'Hearts & Symbols',
    icon: '❤️',
    emojis: [
      '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔',
      '❤️‍🔥', '❤️‍🩹', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝',
      '💯', '💢', '💥', '💫', '💬', '💭', '🗯️', '♠️', '♣️', '♥️',
      '♦️', '🃏', '⭐', '🌟', '✨', '⚡', '☄️', '☀️', '🌙', '🔥'
    ],
  ),
  EmojiCategoryData(
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
  ),
  EmojiCategoryData(
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
  ),
];

const kGifItems = <GifItemData>[
  GifItemData(
    id: 'lets_go',
    title: "Let's Go!",
    category: 'hype',
    url: 'https://media.giphy.com/media/26AHONQ79FdWZhAI0/giphy.gif',
  ),
  GifItemData(
    id: 'victory_confetti',
    title: 'Victory Royale',
    category: 'hype',
    url: 'https://media.giphy.com/media/l0MYt5jPR6QX5pnqM/giphy.gif',
  ),
  GifItemData(
    id: 'fire_hype',
    title: 'Hype Fire',
    category: 'hype',
    url: 'https://media.giphy.com/media/3o72FfM5HJydzafgUE/giphy.gif',
  ),
  GifItemData(
    id: 'dance_party',
    title: 'Dance Party',
    category: 'hype',
    url: 'https://media.giphy.com/media/3o7TKSjRrfIPjeiVyM/giphy.gif',
  ),
  GifItemData(
    id: 'pepe_hype',
    title: 'Pepe Hype',
    category: 'hype',
    url: 'https://media.giphy.com/media/eJ4j2VnYOZU8qJU3Py/giphy.gif',
  ),
  GifItemData(
    id: 'gg_wp',
    title: 'GG WP (Well Played)',
    category: 'gaming',
    url: 'https://media.giphy.com/media/nbvFVPiEiJH6JOGIok/giphy.gif',
  ),
  GifItemData(
    id: 'gg_thumbsup',
    title: 'Good Game Thumbs Up',
    category: 'gaming',
    url: 'https://media.giphy.com/media/111ebonMs90YLu/giphy.gif',
  ),
  GifItemData(
    id: 'rage_quit',
    title: 'Rage Quit Keyboard',
    category: 'gaming',
    url: 'https://media.giphy.com/media/11tTNkNy1SdXGg/giphy.gif',
  ),
  GifItemData(
    id: 'cat_vibing',
    title: 'Cat Vibing Jam',
    category: 'memes',
    url: 'https://media.giphy.com/media/artj92V8o75VPL7AeQ/giphy.gif',
  ),
  GifItemData(
    id: 'mind_blown',
    title: 'Mind Blown',
    category: 'memes',
    url: 'https://media.giphy.com/media/xT0xezQGU5xCDJuCPe/giphy.gif',
  ),
  GifItemData(
    id: 'popcorn_eating',
    title: 'Eating Popcorn',
    category: 'memes',
    url: 'https://media.giphy.com/media/l0HlHFRbmaZtBRhXG/giphy.gif',
  ),
  GifItemData(
    id: 'sus_rock',
    title: 'Sus Eyebrow Raise',
    category: 'memes',
    url: 'https://media.giphy.com/media/JaNtIG4UnKzD2/giphy.gif',
  ),
  GifItemData(
    id: 'rickroll_dance',
    title: 'Never Gonna Give You Up',
    category: 'memes',
    url: 'https://media.giphy.com/media/3oKIPnAiaMCws8nOsE/giphy.gif',
  ),
  GifItemData(
    id: 'leonardo_cheers',
    title: 'Leonardo Cheers',
    category: 'reactions',
    url: 'https://media.giphy.com/media/g9582DNuQppxC/giphy.gif',
  ),
  GifItemData(
    id: 'nodding_yes',
    title: 'Nodding Yes Agree',
    category: 'reactions',
    url: 'https://media.giphy.com/media/NEvPzZ8bdvV4Y/giphy.gif',
  ),
  GifItemData(
    id: 'high_five',
    title: 'High Five',
    category: 'reactions',
    url: 'https://media.giphy.com/media/3o85xkQpyMlnBkpB9C/giphy.gif',
  ),
  GifItemData(
    id: 'clapping_applause',
    title: 'Clapping Ovation',
    category: 'reactions',
    url: 'https://media.giphy.com/media/l4pTfx2qLszoacZRS/giphy.gif',
  ),
  GifItemData(
    id: 'facepalm',
    title: 'Facepalm Sigh',
    category: 'reactions',
    url: 'https://media.giphy.com/media/3oEjI67Egb8G9jqs3m/giphy.gif',
  ),
  GifItemData(
    id: 'blinking_guy',
    title: 'Blinking White Guy',
    category: 'reactions',
    url: 'https://media.giphy.com/media/3ELtfmA4Apkju/giphy.gif',
  ),
  GifItemData(
    id: 'crying_cat',
    title: 'Crying Tear Cat',
    category: 'reactions',
    url: 'https://media.giphy.com/media/dzaUX7CAG0Ihi/giphy.gif',
  ),
  GifItemData(
    id: 'anime_power',
    title: 'Super Saiyan Power Up',
    category: 'anime',
    url: 'https://media.giphy.com/media/ul1omlrGG6kpO/giphy.gif',
  ),
];

const kStickerItems = <StickerItemData>[
  StickerItemData(
    id: 'badge_controller',
    name: 'Pro Controller',
    pack: 'badges',
    url: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f3ae.png',
  ),
  StickerItemData(
    id: 'badge_trophy',
    name: 'Champion Trophy',
    pack: 'badges',
    url: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f3c6.png',
  ),
  StickerItemData(
    id: 'badge_crown',
    name: 'Squad MVP Crown',
    pack: 'badges',
    url: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f451.png',
  ),
  StickerItemData(
    id: 'badge_target',
    name: 'Headshot Bullseye',
    pack: 'badges',
    url: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f3af.png',
  ),
  StickerItemData(
    id: 'badge_swords',
    name: 'Battle Swords',
    pack: 'badges',
    url: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/2694.png',
  ),
  StickerItemData(
    id: 'badge_bomb',
    name: 'Spike Defused',
    pack: 'badges',
    url: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f4a3.png',
  ),
  StickerItemData(
    id: 'badge_skull',
    name: 'Team Wipe Ace',
    pack: 'badges',
    url: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f480.png',
  ),
  StickerItemData(
    id: 'badge_fire',
    name: 'Killstreak Fire',
    pack: 'badges',
    url: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f525.png',
  ),
  StickerItemData(
    id: 'badge_lightning',
    name: 'Clutch Master',
    pack: 'badges',
    url: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/26a1.png',
  ),
  StickerItemData(
    id: 'badge_rocket',
    name: 'To The Moon',
    pack: 'badges',
    url: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f680.png',
  ),
  StickerItemData(
    id: 'badge_gem',
    name: 'Diamond Tier',
    pack: 'badges',
    url: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f48e.png',
  ),
  StickerItemData(
    id: 'badge_100',
    name: '100% Perfection',
    pack: 'badges',
    url: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f4af.png',
  ),
  StickerItemData(
    id: 'pika_hype',
    name: 'Squad Pikachu',
    pack: 'squad',
    url: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/25.png',
  ),
  StickerItemData(
    id: 'char_fire',
    name: 'Charizard Blazing',
    pack: 'squad',
    url: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/6.png',
  ),
  StickerItemData(
    id: 'gengar_smirk',
    name: 'Gengar Phantom',
    pack: 'squad',
    url: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/94.png',
  ),
  StickerItemData(
    id: 'eevee_cute',
    name: 'Eevee Greetings',
    pack: 'squad',
    url: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/133.png',
  ),
  StickerItemData(
    id: 'snorlax_afk',
    name: 'Snorlax AFK',
    pack: 'squad',
    url: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/143.png',
  ),
  StickerItemData(
    id: 'mewtwo_iq',
    name: 'Mewtwo 1000 IQ',
    pack: 'squad',
    url: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/150.png',
  ),
  StickerItemData(
    id: 'lucario_aura',
    name: 'Lucario Aura Focus',
    pack: 'squad',
    url: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/448.png',
  ),
  StickerItemData(
    id: 'greninja_ninja',
    name: 'Greninja Stealth',
    pack: 'squad',
    url: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/658.png',
  ),
];
