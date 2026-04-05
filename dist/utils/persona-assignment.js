"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hasAssignment = hasAssignment;
exports.personaKey = personaKey;
exports.selectAssignedProfilePics = selectAssignedProfilePics;
exports.generateCandidateCombinations = generateCandidateCombinations;
function djb2(str) {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
    }
    return hash;
}
function makeLCG(seed) {
    let s = seed | 0;
    return function next() {
        s = (Math.imul(s, 1664525) + 1013904223) | 0;
        return (s >>> 0) / 0x100000000;
    };
}
function seededPick(arr, prng) {
    const idx = Math.floor(prng() * arr.length);
    return arr[idx];
}
function seededShuffle(arr, prng) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(prng() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}
function hasAssignment(doc) {
    return (doc.assignedFirstName !== null ||
        doc.assignedLastName !== null ||
        doc.assignedBio !== null ||
        doc.assignedProfilePics.length > 0);
}
function personaKey(a) {
    return JSON.stringify([a.firstName, a.lastName, a.bio, [...a.profilePics].sort()]);
}
function selectAssignedProfilePics(mobile, profilePics) {
    if (profilePics.length === 0)
        return [];
    const seed = djb2(mobile + ':photos');
    const prng = makeLCG(seed);
    const shuffledProfilePics = [...profilePics];
    seededShuffle(shuffledProfilePics, prng);
    return shuffledProfilePics.slice(0, 3);
}
const MAX_CANDIDATES = 64;
function generateCandidateCombinations(pool, mobile) {
    const seed = djb2(mobile);
    const prng = makeLCG(seed);
    const firstNames = pool.firstNames.length > 0 ? [...pool.firstNames] : [''];
    const lastNames = pool.lastNames.length > 0 ? [...pool.lastNames] : [''];
    const bios = pool.bios.length > 0 ? [...pool.bios] : [''];
    seededShuffle(firstNames, prng);
    seededShuffle(lastNames, prng);
    seededShuffle(bios, prng);
    const seen = new Set();
    const results = [];
    outer: for (const bio of bios) {
        for (const lastName of lastNames) {
            for (const firstName of firstNames) {
                if (results.length >= MAX_CANDIDATES)
                    break outer;
                const profilePics = selectAssignedProfilePics(mobile + ':' + firstName + ':' + lastName, pool.profilePics);
                const candidate = {
                    firstName,
                    lastName,
                    bio,
                    profilePics,
                };
                const key = personaKey(candidate);
                if (!seen.has(key)) {
                    seen.add(key);
                    results.push(candidate);
                }
            }
        }
    }
    return results;
}
//# sourceMappingURL=persona-assignment.js.map