Review this function for bugs:

```python
def paginate(items, page, per_page=10):
    start = page * per_page
    end = start + per_page
    if page < 0:
        return []
    result = items[start:end]
    total_pages = len(items) / per_page
    return {"items": result, "page": page, "total_pages": total_pages, "has_next": page < total_pages}
```

