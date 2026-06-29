# API Contracts: [FEATURE NAME]

> specs/NNN-feature-name/contracts/

## Endpoint: [Method] [Path]

### Request

```
[Method] [Path]
Content-Type: [type]
Authorization: [auth scheme]

[Body schema]
```

### Response

**200 OK**
```json
{
  "field": "type",
  "description": "example value"
}
```

**4xx / 5xx**
```json
{
  "error": "string",
  "code": "string"
}
```

### Errors

| Code | HTTP Status | Meaning |
|------|------------|---------|
| [code] | [status] | [description] |

---

## Types

### [TypeName]

```json
{
  "field1": "string",
  "field2": "number"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| field1 | string | yes | [description] |
| field2 | number | no | [description] |
