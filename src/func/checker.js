const { default_allowed_characters } = require("../config");

function hasEmojis(text) {
    return /\p{Extended_Pictographic}/u.test(text);
}

function hasInvalidCharacters(text, allowedChars) {
    if(!allowedChars) allowedChars = default_allowed_characters;
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (!allowedChars.includes(char)) {
            return true;
        }
    }
    return false;
}

module.exports = {
    hasEmojis,
    hasInvalidCharacters
}