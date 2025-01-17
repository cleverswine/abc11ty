using AbcAdmin.Components;
using AbcAdmin.Models;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddRazorComponents();
builder.Services.AddAntiforgery();
builder.Services.AddHttpContextAccessor();
builder.Services.AddSingleton(new ItemRepository());

var app = builder.Build();

app.UseHttpsRedirection();
app.UseStaticFiles();
app.UseAntiforgery();

// List items
app.MapGet("/", async ([FromServices] ItemRepository itemRepository)
    => new RazorComponentResult<Home>(new {ItemModels = await itemRepository.GetItems()}));

// Add item
app.MapPost("/add", async (HttpRequest request, [FromServices] ItemRepository itemRepository)
    =>
{
    var form = await request.ReadFormAsync();
    return new RazorComponentResult<Items>(new {ItemModels = await itemRepository.AddOrUpdateItem(new ItemModel(form["title"].First() ?? "UNK"))});
});

// Get edit form
app.MapGet("/edit/{id:guid}", async (HttpRequest request, [FromRoute] Guid id, [FromServices] ItemRepository itemRepository)
    => new RazorComponentResult<ItemEdit>(new {ItemModel = await itemRepository.GetItem(id)}));

// Update item
app.MapPut("/edit/{id:guid}", async (HttpRequest request, [FromRoute] Guid id, [FromServices] ItemRepository itemRepository)
    => new RazorComponentResult<Item>(new {ItemModel = await itemRepository.GetItem(id)}));

app.Run();