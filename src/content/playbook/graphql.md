---
title: "GraphQL"
tags: [methodology, graphql]
summary: "Attacking GraphQL APIs — introspection dumps, IDOR/BOLA via variables, injection in resolvers, mutation abuse, and DoS via depth/batching."
draft: false
---

## 1. Discovery & Introspection
- [ ] Identify GraphQL endpoints (typically `/graphql`, `/api/graphql`, `/v1/graphql`).
- [ ] Send an Introspection query to dump the schema:
  ```graphql
  { __schema { types { name fields { name } } } }
  ```
- [ ] If introspection is disabled, try to bypass it using field suggestions (e.g., querying for a typo `usres` to see if it suggests `users`).

## 2. Exploitation
- [ ] **Information Disclosure**: Query for hidden fields or admin data identified in the schema dump.
- [ ] **IDOR / BOLA**: Request data for other users using their IDs via GraphQL variables.
- [ ] **SQLi / Injection**: GraphQL resolvers often pass input directly to databases. Test SQLi payloads in input variables.
- [ ] **Mutation Abuse**: Test mutations (state-changing operations) for authorization bypasses (e.g., `updateProfile(role: ADMIN)`).

## 3. Denial of Service (DoS)
- [ ] **Query Depth**: Send deeply nested queries if the server doesn't limit depth.
  ```graphql
  query { author(id: 1) { posts { author { posts { author { name } } } } } }
  ```
- [ ] **Batching Attacks**: Send an array of queries in a single request to bypass rate limiting or overload the server (great for brute-forcing passwords).
