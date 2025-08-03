import { createToken } from "chevrotain";

export const LBrace       = createToken({ name: "LBrace", pattern: /\{/ });
export const RBrace       = createToken({ name: "RBrace", pattern: /\}/ });
export const Pipe         = createToken({ name: "Pipe", pattern: /\|/ });
export const IfKeyword    = createToken({ name: "IfKeyword", pattern: /@if/ });
export const BangTilde    = createToken({ name: "BangTilde", pattern: /!~/ });
export const WildcardToken= createToken({ name: "WildcardToken", pattern: /__[^_]+__/ });
export const TextToken    = createToken({ name: "TextToken", pattern: /[^{}|]+/ });

export const allTokens    = [LBrace,RBrace,Pipe,IfKeyword,BangTilde,WildcardToken,TextToken];