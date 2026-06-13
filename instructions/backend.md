# Spring Boot Java Services: Development Guidelines & Context

This document serves as the primary context for Gemini when assisting with the design, development, refactoring, or troubleshooting of Spring Boot Java services.

---

## 🏗️ Architectural Overview
*   **Framework:** Spring Boot 3+ using Java 17 or higher.
*   **Pattern:** Follow a layered architecture (Controller -> Service -> Repository) or Clean Architecture/Hexagonal patterns where appropriate.
*   **API Design:** Adhere to RESTful principles. Use appropriate HTTP methods (GET, POST, PUT, DELETE, PATCH) and standard status codes.
*   **Data Transfer:** Always use DTOs (Data Transfer Objects) to communicate between the web layer and the service layer. Never expose JPA entities directly to the client.

---

## 🛠️ Coding Standards & Best Practices
| Category | Guidelines |
|---|---|
| **Boilerplate** | Use **Lombok** (`@Data`, `@Value`, `@Builder`, `@RequiredArgsConstructor`) to keep code concise. |
| **Dependency Injection** | Prefer **Constructor Injection** over field injection (`@Autowired` on fields). |
| **Validation** | Use `jakarta.validation` annotations (e.g., `@NotNull`, `@Size`, `@Valid`) in DTOs. |
| **Error Handling** | Implement a global exception handler using `@RestControllerAdvice` and `@ExceptionHandler`. |
| **Logging** | Use SLF4J with Logback. Avoid `System.out.println`. |
| **Asynchronous** | Use `@Async` for non-blocking operations, ensuring a task executor is properly configured. |

---

## 🧪 Testing Strategy
*   **Unit Tests:** Use **JUnit 5** and **Mockito**. Focus on testing business logic in isolation.
*   **Integration Tests:** Use `@SpringBootTest` with `@ActiveProfiles("test")`.
*   **API Testing:** Utilize `MockMvc` for testing controller endpoints without starting a full web server.
*   **Database Testing:** Use `@DataJpaTest` or **Testcontainers** for isolated database testing.

---

## 💻 Code Examples & Tooling

### Project Structure Example
| Path | Description |
|---|---|
| `src/main/java/.../controller` | REST Controllers |
| `src/main/java/.../service` | Business Logic Interfaces and Implementations |
| `src/main/java/.../repository` | Spring Data JPA Repositories |
| `src/main/java/.../dto` | Request and Response DTOs |
| `src/main/java/.../exception` | Custom Exceptions and Global Handler |

### Code Formatting (Standard Rest Controller)
```java
@RestController
@RequestMapping("/api/v1/users")
@RequiredArgsConstructor
public class UserController {

    private final UserService userService;

    @PostMapping
    public ResponseEntity<UserResponseDTO> createUser(@Valid @RequestBody UserRequestDTO request) {
        var response = userService.registerUser(request);
        return new ResponseEntity<>(response, HttpStatus.CREATED);
    }
}
```

### Essential Tools
*   **Build Tool:** Maven
*   **Database Migrations:** Liquibase.
*   **Documentation:** SpringDoc OpenAPI (Swagger UI).
*   **Static Analysis:** SonarLint / Checkstyle (following Google Java Style).

---