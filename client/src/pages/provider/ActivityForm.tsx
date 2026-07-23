import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { apiRequest, ApiError } from "../../lib/apiClient";
import type { Activity, AgeGroup } from "../../lib/types";
import "./provider.css";

const CATEGORIES = ["Swimming", "Football", "Dance", "Martial Arts", "Music", "Art", "Gymnastics", "Other"];

export function ActivityForm() {
  const navigate = useNavigate();
  const [ageGroups, setAgeGroups] = useState<AgeGroup[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [ageGroupId, setAgeGroupId] = useState("");
  const [location, setLocation] = useState("");
  const [capacity, setCapacity] = useState(10);
  const [creditCost, setCreditCost] = useState(1);
  const [isSendFriendly, setIsSendFriendly] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    apiRequest<{ ageGroups: AgeGroup[] }>("/age-groups", { skipAuth: true }).then((data) => {
      setAgeGroups(data.ageGroups);
      if (data.ageGroups.length > 0) setAgeGroupId(data.ageGroups[0].id);
    });
  }, []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const data = await apiRequest<{ activity: Activity }>("/activities", {
        method: "POST",
        body: { title, description, category, ageGroupId, location, capacity, creditCost, isSendFriendly },
      });
      navigate(`/provider/activities/${data.activity.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="provider-page">
      <h1>New activity</h1>

      <form className="form" onSubmit={handleSubmit}>
        <label>
          Title
          <input value={title} onChange={(e) => setTitle(e.target.value)} required />
        </label>

        <label>
          Description
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} required />
        </label>

        <div className="form-row">
          <label>
            Category
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>

          <label>
            Age group
            <select value={ageGroupId} onChange={(e) => setAgeGroupId(e.target.value)} required>
              {ageGroups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label>
          Location
          <input value={location} onChange={(e) => setLocation(e.target.value)} required />
        </label>

        <div className="form-row">
          <label>
            Capacity per class
            <input
              type="number"
              min={1}
              value={capacity}
              onChange={(e) => setCapacity(Number(e.target.value))}
              required
            />
          </label>

          <label>
            Credit cost per booking
            <input
              type="number"
              min={1}
              value={creditCost}
              onChange={(e) => setCreditCost(Number(e.target.value))}
              required
            />
          </label>
        </div>

        <label className="form__checkbox">
          <input
            type="checkbox"
            checked={isSendFriendly}
            onChange={(e) => setIsSendFriendly(e.target.checked)}
          />
          SEND-friendly (suitable for children with special educational needs/disabilities)
        </label>

        {error && <p className="form__error">{error}</p>}

        <button type="submit" className="button" disabled={isSubmitting || !ageGroupId}>
          {isSubmitting ? "Creating…" : "Create activity"}
        </button>
      </form>
    </div>
  );
}
