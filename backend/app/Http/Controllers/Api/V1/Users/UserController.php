<?php

namespace App\Http\Controllers\Api\V1\Users;

use App\Domain\Users\Services\UserAdminService;
use App\Enums\UserRole;
use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password;

class UserController extends Controller
{
    public function __construct(private readonly UserAdminService $users) {}

    public function index(Request $request): JsonResponse
    {
        $filters = $request->validate([
            'q' => ['nullable', 'string', 'max:200'],
            'search' => ['nullable', 'string', 'max:200'],
            'role' => ['nullable', 'string', Rule::in(UserRole::values())],
            'active' => ['nullable', 'string', Rule::in(['1', '0', 'true', 'false', 'all'])],
            'page' => ['nullable', 'integer', 'min:1'],
            'per_page' => ['nullable', 'integer', 'min:10', 'max:100'],
        ]);

        $page = $this->users->list($filters);

        return response()->json([
            'data' => collect($page->items())->map(fn (User $u) => $this->users->toApiArray($u))->values()->all(),
            'meta' => [
                'current_page' => $page->currentPage(),
                'last_page' => $page->lastPage(),
                'per_page' => $page->perPage(),
                'total' => $page->total(),
            ],
            'filters' => [
                'roles' => array_map(
                    fn (UserRole $r) => ['value' => $r->value, 'label' => $r->label()],
                    UserRole::cases()
                ),
            ],
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'email' => ['required', 'email', 'max:190', 'unique:users,email'],
            'password' => ['required', 'string', 'confirmed', Password::defaults()],
            'role' => ['required', 'string', Rule::in(UserRole::values())],
            'active' => ['nullable', 'boolean'],
        ]);

        /** @var User $actor */
        $actor = $request->user();
        $user = $this->users->create($data, (int) $actor->id);

        return response()->json(['data' => $this->users->toApiArray($user)], 201);
    }

    public function update(Request $request, User $user): JsonResponse
    {
        $data = $request->validate([
            'name' => ['sometimes', 'required', 'string', 'max:120'],
            'email' => ['sometimes', 'required', 'email', 'max:190', Rule::unique('users', 'email')->ignore($user->id)],
            'role' => ['sometimes', 'required', 'string', Rule::in(UserRole::values())],
        ]);

        /** @var User $actor */
        $actor = $request->user();
        $updated = $this->users->update($user, $data, (int) $actor->id);

        return response()->json(['data' => $this->users->toApiArray($updated)]);
    }

    public function deactivate(Request $request, User $user): JsonResponse
    {
        /** @var User $actor */
        $actor = $request->user();
        $updated = $this->users->deactivate($user, (int) $actor->id);

        return response()->json(['data' => $this->users->toApiArray($updated)]);
    }

    public function reactivate(Request $request, User $user): JsonResponse
    {
        /** @var User $actor */
        $actor = $request->user();
        $updated = $this->users->reactivate($user, (int) $actor->id);

        return response()->json(['data' => $this->users->toApiArray($updated)]);
    }

    public function resetPassword(Request $request, User $user): JsonResponse
    {
        $data = $request->validate([
            'password' => ['required', 'string', 'confirmed', Password::defaults()],
        ]);

        /** @var User $actor */
        $actor = $request->user();
        $updated = $this->users->resetPassword($user, $data, (int) $actor->id);

        return response()->json([
            'message' => 'Contraseña actualizada.',
            'data' => $this->users->toApiArray($updated),
        ]);
    }
}
