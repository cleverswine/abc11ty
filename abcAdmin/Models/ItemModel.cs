namespace AbcAdmin.Models;

public class ItemRepository
{
    private readonly List<ItemModel> _items = [new ItemModel("Test One")];

    public async Task<List<ItemModel>> AddOrUpdateItem(ItemModel item)
    {
        await Task.Yield();

        var existing = _items.FirstOrDefault(x => x.Id == item.Id);
        if (existing != null)
        {
            existing.Title = item.Title;
            existing.Description = item.Description;
            existing.ImageUrl = item.ImageUrl;
            existing.Link = item.Link;
            return await GetItems();
        }

        item.Id = Guid.NewGuid();
        _items.Add(item);

        return await GetItems();
    }

    public async Task<ItemModel> GetItem(Guid id)
    {
        await Task.Yield();
        return _items.First(x => x.Id == id);
    }
    
    public async Task<List<ItemModel>> GetItems()
    {
        await Task.Yield();
        return _items;
    }
}

public class ItemModel(string title)
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Title { get; set; } = title;
    public string? Description { get; set; }
    public string? ImageUrl { get; set; }
    public string? Link { get; set; }
}