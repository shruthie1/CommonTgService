export interface PersonaPool {
    firstNames: string[];
    lastNames: string[];
    bios: string[];
    profilePics: string[];
    dbcoll: string;
}
export interface PersonaAssignment {
    assignedFirstName: string | null;
    assignedLastName: string | null;
    assignedBio: string | null;
    assignedProfilePics: string[];
}
export interface PersonaCandidate {
    firstName: string;
    lastName: string;
    bio: string;
    profilePics: string[];
}
export declare function hasAssignment(doc: PersonaAssignment): boolean;
export declare function personaKey(a: {
    firstName: string;
    lastName: string;
    bio: string;
    profilePics: string[];
}): string;
export declare function selectAssignedProfilePics(mobile: string, profilePics: string[]): string[];
export declare function generateCandidateCombinations(pool: PersonaPool, mobile: string): PersonaCandidate[];
