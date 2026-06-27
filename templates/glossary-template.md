---
entities:
  - name: EntityName
    description: Brief description of what this entity represents
    attributes: [attribute1, attribute2, attribute3]
    relations: [RelatedEntity(relationType), OtherEntity(relationType)]
    bounded-context: context-name
  - name: SecondEntity
    description: Description of the second entity
    attributes: [attr1, attr2]
    relations: [EntityName(relationType)]
    bounded-context: context-name
---
# Domain Glossary

## EntityName

| Attribute | Type | Description |
|-----------|------|-------------|
| attribute1 | type | Description of attribute1 |
| attribute2 | type | Description of attribute2 |
| attribute3 | type | Description of attribute3 |

Relations:
- Has many `RelatedEntity` via relationType
- Belongs to `OtherEntity` via relationType

Bounded context: context-name

---

## SecondEntity

| Attribute | Type | Description |
|-----------|------|-------------|
| attr1 | type | Description of attr1 |
| attr2 | type | Description of attr2 |

Relations:
- Belongs to `EntityName` via relationType

Bounded context: context-name
